# AWS Rekognition Integration

**Status:** Draft
**Last Updated:** 2025-12-08

---

## Overview

AWS Rekognition provides face detection and indexing for photo search. This doc covers the **implementation details** for integrating Rekognition with Cloudflare Workers, including rate limiting and queue processing.

**Related docs:**

- `05_image_pipeline.md` - Business flow (upload → process → ready)
- `01_data_schema.md` - `faces` table schema
- `docs/research/rekognition_collection_pricing.md` - Pricing details
- `docs/research/rekognition_embedding_export.md` - API limitations

---

## Configuration

**Region:** `us-west-2` (Oregon)

- 10x throughput: 50 TPS vs 5 TPS in `ap-southeast-1`
- Latency: +150-200ms (acceptable for <3s search target)
- Cost: Same pricing, R2 egress to AWS is free
- PDPA: No data residency requirement in Thailand

**Collection strategy:** One collection per event

- Collection ID: `sabaipics-{event_uuid}`
- Created on event publish
- Deleted on event expiry (30 days default)

---

## The Rate Limiting Challenge

### Problem

AWS Rekognition `IndexFaces` has a **50 TPS limit** in us-west-2.

**TPS means evenly distributed**, not burst:

- 50 requests spread over 1 second = OK
- 50 requests fired simultaneously = throttled

**Scenario:** Photographer uploads 500 photos

- Queue delivers batch of 50 messages
- Worker processes all 50 in parallel
- 50 simultaneous Rekognition calls = **instant burst**
- Result: `ProvisionedThroughputExceededException`

### Why Cloudflare Queues Alone Isn't Enough

Queue config:

```jsonc
{
  "max_batch_size": 50,
  "max_concurrency": 1,
}
```

This controls **batch delivery**, not **request pacing**:

- Consumer receives 50 messages at once
- If processed with `Promise.all()` → 50 concurrent API calls
- No spacing between individual requests

### Solution: Durable Object Rate Limiter

Use a Durable Object to:

1. Track time slots for batches
2. Calculate required delay before processing
3. Provide pacing interval within batch

**Why Durable Objects work:**

- **Single-threaded execution** - No race conditions
- **Persistent state** - Survives across requests (within 10s idle timeout)
- **Per-instance isolation** - One rate limiter for Rekognition

**Key insight:** If DO is cold (idle >10s), no recent API activity, safe to proceed immediately.

---

## Implementation Design

### Durable Object: RekognitionRateLimiter

```typescript
export class RekognitionRateLimiter extends DurableObject {
  private lastBatchEndTime: number = 0;

  async reserveBatch(batchSize: number): Promise<{ delay: number; intervalMs: number }> {
    const now = Date.now();
    const TPS = 50;
    const intervalMs = 1000 / TPS; // 20ms between requests
    const batchDuration = batchSize * intervalMs; // 50 items = 1000ms

    // When can this batch start?
    const delay = Math.max(0, this.lastBatchEndTime - now);

    // Reserve our time slot
    this.lastBatchEndTime = now + delay + batchDuration;

    return { delay, intervalMs };
  }
}
```

**Behavior:**

| Scenario               | Result                                 |
| ---------------------- | -------------------------------------- |
| Cold start (idle >10s) | `delay: 0`, start immediately          |
| Back-to-back batches   | Second batch waits for first to finish |
| 50 items at 50 TPS     | 50 × 20ms = 1 second total             |

### Queue Consumer with Explicit Ack/Retry

**Why explicit acknowledgement?**

Default queue behavior: If batch fails on message #8, **all 50 messages retry**.

Problems:

- Re-processing already indexed photos
- Wasted Rekognition API calls ($$)
- Potential duplicate face records

**Solution:** Call `msg.ack()` on success, `msg.retry()` on failure.

```typescript
import { DurableObjectNamespace, MessageBatch } from '@cloudflare/workers-types';

interface PhotoJob {
  photo_id: string;
  event_id: string;
  r2_key: string;
}

interface Env {
  RATE_LIMITER: DurableObjectNamespace;
  // ... other bindings
}

export default {
  async queue(batch: MessageBatch<PhotoJob>, env: Env): Promise<void> {
    const rateLimiter = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName('rekognition'));

    // Reserve time slot for this batch
    const { delay, intervalMs } = await rateLimiter.reserveBatch(batch.messages.length);

    // Wait for our slot if needed
    if (delay > 0) {
      await sleep(delay);
    }

    // Process with pacing
    for (const msg of batch.messages) {
      try {
        await processPhoto(msg.body, env);
        msg.ack(); // Success - don't redeliver
      } catch (error) {
        if (isThrottlingError(error)) {
          // Rekognition rate limit hit - back off
          msg.retry({ delaySeconds: exponentialBackoff(msg.attempts) });
        } else {
          // Other error - normal retry
          msg.retry();
        }
      }

      // Pace requests (20ms = 50 TPS)
      await sleep(intervalMs);
    }
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function exponentialBackoff(attempts: number): number {
  // 2^attempts seconds, max 5 minutes (300s)
  return Math.min(Math.pow(2, attempts), 300);
}

function isThrottlingError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ProvisionedThroughputExceededException';
}
```

### Wrangler Configuration

```jsonc
{
  "compatibility_flags": ["nodejs_compat"],

  "queues": {
    "producers": [
      {
        "queue": "photo-processing",
        "binding": "PHOTO_QUEUE",
      },
    ],
    "consumers": [
      {
        "queue": "photo-processing",
        "max_batch_size": 50,
        "max_batch_timeout": 5,
        "max_retries": 3,
        "max_concurrency": 1,
        "dead_letter_queue": "photo-processing-dlq",
      },
    ],
  },

  "durable_objects": {
    "bindings": [
      {
        "name": "RATE_LIMITER",
        "class_name": "RekognitionRateLimiter",
      },
    ],
  },
}
```

---

## Processing Flow

### Photo Processing (IndexFaces)

```typescript
async function processPhoto(job: PhotoJob, env: Env): Promise<void> {
  const { photo_id, event_id, r2_key } = job;
  const db = createDb(env.DATABASE_URL);

  // 1. Update status
  await db.update(photos).set({ status: 'processing' }).where(eq(photos.id, photo_id));

  // 2. Get image from R2
  const imageBytes = await env.PHOTOS_BUCKET.get(r2_key);
  if (!imageBytes) throw new Error(`Image not found: ${r2_key}`);

  // 3. Call Rekognition IndexFaces
  const rekognition = new RekognitionClient({
    region: 'us-west-2',
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const response = await rekognition.send(
    new IndexFacesCommand({
      CollectionId: `sabaipics-${event_id}`,
      Image: { Bytes: await imageBytes.arrayBuffer() },
      ExternalImageId: photo_id,
      DetectionAttributes: ['ALL'],
      MaxFaces: 100,
      QualityFilter: 'AUTO',
    }),
  );

  // 4. Insert face records
  const faceRecords =
    response.FaceRecords?.map((record) => ({
      photo_id,
      event_id,
      rekognition_face_id: record.Face?.FaceId,
      bbox_left: record.Face?.BoundingBox?.Left,
      bbox_top: record.Face?.BoundingBox?.Top,
      bbox_width: record.Face?.BoundingBox?.Width,
      bbox_height: record.Face?.BoundingBox?.Height,
      confidence: record.Face?.Confidence,
      // ... all FaceDetail attributes (see 01_data_schema.md)
    })) ?? [];

  if (faceRecords.length > 0) {
    await db.insert(faces).values(faceRecords);
  }

  // 5. Update photo status
  await db
    .update(photos)
    .set({
      status: 'ready',
      face_count: faceRecords.length,
      faces_indexed: true,
      processed_at: new Date(),
    })
    .where(eq(photos.id, photo_id));

  // 6. Update event stats
  await db
    .update(events)
    .set({
      photo_count: sql`photo_count + 1`,
      face_count: sql`face_count + ${faceRecords.length}`,
    })
    .where(eq(events.id, event_id));
}
```

---

## Collection Lifecycle

### Create Collection (on event publish)

```typescript
async function createCollection(eventId: string, env: Env): Promise<void> {
  const rekognition = new RekognitionClient({
    region: 'us-west-2',
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  await rekognition.send(
    new CreateCollectionCommand({
      CollectionId: `sabaipics-${eventId}`,
      Tags: {
        event_id: eventId,
        created_at: new Date().toISOString(),
      },
    }),
  );

  // Update event record
  const db = createDb(env.DATABASE_URL);
  await db
    .update(events)
    .set({ rekognition_collection_id: `sabaipics-${eventId}` })
    .where(eq(events.id, eventId));
}
```

### Delete Collection (on event expiry)

```typescript
async function deleteCollection(eventId: string, env: Env): Promise<void> {
  const rekognition = new RekognitionClient({
    region: 'us-west-2',
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // Delete collection (also deletes all face vectors)
  await rekognition.send(
    new DeleteCollectionCommand({
      CollectionId: `sabaipics-${eventId}`,
    }),
  );
}
```

**Cleanup order (important):**

1. Delete Rekognition collection (prevents new searches)
2. Delete R2 objects (bulk delete by prefix)
3. Delete face records from DB
4. Mark event as expired

---

## Error Handling

### Rekognition Errors

| Error                                    | Handling                                    |
| ---------------------------------------- | ------------------------------------------- |
| `ProvisionedThroughputExceededException` | Retry with exponential backoff              |
| `InvalidImageFormatException`            | Mark photo as failed, don't retry           |
| `ImageTooLargeException`                 | Mark photo as failed, don't retry           |
| `InvalidParameterException`              | Mark photo as failed, log for investigation |
| `ResourceNotFoundException`              | Collection doesn't exist, create it         |

### Dead Letter Queue

Messages that fail after `max_retries` (3) go to `photo-processing-dlq`.

**DLQ handling:**

- Alert on DLQ messages (monitoring)
- Manual investigation required
- Common causes: corrupted images, missing R2 objects

---

## AWS Credentials

**Storage:** Wrangler secrets (not env vars)

```bash
# Set secrets
npx wrangler secret put AWS_ACCESS_KEY_ID
npx wrangler secret put AWS_SECRET_ACCESS_KEY

# Per environment
npx wrangler secret put AWS_ACCESS_KEY_ID --env staging
npx wrangler secret put AWS_ACCESS_KEY_ID --env production
```

**Local development:** `.dev.vars` file

```env
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

**IAM Policy (minimum required):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateCollection",
        "rekognition:DeleteCollection",
        "rekognition:IndexFaces",
        "rekognition:SearchFacesByImage",
        "rekognition:ListFaces",
        "rekognition:DeleteFaces"
      ],
      "Resource": "arn:aws:rekognition:us-west-2:*:collection/sabaipics-*"
    }
  ]
}
```

---

## Performance Targets

| Metric                   | Target     | Notes                     |
| ------------------------ | ---------- | ------------------------- |
| IndexFaces latency       | ~500-700ms | Per photo, from us-west-2 |
| Batch of 50 photos       | ~2-3s      | With 20ms pacing          |
| Bulk upload (500 photos) | ~15-20s    | 10 batches × 50           |
| SearchFacesByImage       | <1s        | Single call               |

---

## Monitoring

### Key Metrics

- Queue depth (backlog)
- DLQ message count
- Rekognition API errors (by type)
- Processing time per photo
- Rate limiter delay (how often batches wait)

### Alerts

- DLQ messages > 0
- Processing errors spike
- Average delay > 5s (indicates sustained high load)

---

## TODO

- [ ] Consider notifying DO of throttle events to dynamically slow down
- [ ] Add circuit breaker for sustained Rekognition errors
- [ ] Implement batch processing metrics dashboard

---

## References

- [AWS Rekognition IndexFaces](https://docs.aws.amazon.com/rekognition/latest/APIReference/API_IndexFaces.html)
- [Cloudflare Queues Batching & Retries](https://developers.cloudflare.com/queues/configuration/batching-retries/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Build a Rate Limiter with Durable Objects](https://developers.cloudflare.com/durable-objects/examples/build-a-rate-limiter/)
