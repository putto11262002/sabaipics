# Risk Scout: T-17 Photo Queue Consumer (Rekognition Indexing)

**Root ID:** BS_0001_S-1
**Task:** T-17 - Photo queue consumer for Rekognition indexing
**Date:** 2026-01-12
**Status:** Pre-implementation analysis

---

## Executive Summary

T-17 is a **CRITICAL PATH, HIGH RISK** task that adds AWS Rekognition face detection to the existing queue consumer. This task bridges photo uploads to searchable face data and involves:

1. **AWS Rekognition API integration** (external service, rate limits, costs)
2. **Lazy collection creation** (race conditions, idempotency)
3. **Database persistence** (face records with full JSONB response)
4. **Image format transformation** (HEIC/WebP → JPEG via Cloudflare Images)
5. **Error classification and retry logic** (already exists, needs extension)

**Critical finding:** The queue consumer infrastructure already exists (`photo-consumer.ts`) with rate limiting, retry logic, and error classification. T-17 extends this by adding:

- Collection creation logic (lazy, on first photo)
- Database writes (faces table, photos status update)
- Image transformation handling (for HEIC/WebP inputs)

**Key risks:**

1. Race conditions in lazy collection creation
2. AWS Rekognition rate limits and throttling (50 TPS)
3. Image transformation failures with non-JPEG formats
4. Database transaction failures leaving inconsistent state
5. Cost accumulation from Rekognition API calls
6. DLQ photos with no recovery mechanism

---

## 1. AWS Rekognition Integration Risks (CRITICAL)

### 1.1 Rate Limiting and Throttling

**Evidence from existing code (`photo-consumer.ts`):**

```typescript
// Rate limiter DO (singleton) - uses RPC
const rateLimiterId = env.AWS_REKOGNITION_RATE_LIMITER.idFromName('global');
const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(rateLimiterId);

const { delay, intervalMs } = await rateLimiter.reserveBatch(batch.messages.length);
```

**Infrastructure exists:** Durable Object rate limiter coordinates across queue consumer invocations.

**[RISK]** Rate limiter assumes 50 TPS limit for `us-west-2`. If AWS account is shared or region changes, limit may differ.

**[RISK]** Batch processing with 20ms intervals (50 TPS pacing) works for steady load. Burst traffic (e.g., photographer uploads 200 photos at once) causes queue backlog.

**Mitigation:**

- Monitor queue depth metric (alert if > 500)
- Adjust batch size down during high load (current max: 50)
- Consider multiple AWS regions for higher throughput (requires collection duplication)

### 1.2 API Error Handling

**Evidence from `rekognition/errors.ts`:**

```typescript
const RETRYABLE_ERROR_NAMES = new Set([
  'ProvisionedThroughputExceededException',
  'ThrottlingException',
  'LimitExceededException',
  'InternalServerError',
  // ...
]);
```

**Infrastructure exists:** Error classification already handles Rekognition-specific errors.

**[GAP]** Missing error types for T-17:

- `ResourceNotFoundException` during IndexFaces if collection deleted between upload and processing
- `InvalidParameterException` if image dimensions exceed limits (unlikely after normalization)

**Recommended additions:**

```typescript
// In isRetryableError():
if (error.name === 'ResourceNotFoundException' && error.message.includes('Collection')) {
  // Collection deleted/not found - should recreate and retry
  return true;
}
```

### 1.3 Cost Management

**Evidence from plan:**

> "Monitor Rekognition API errors, Monitor rate limiter DO"

**[RISK]** No cost tracking or alerting exists. Rekognition IndexFaces pricing:

- $0.001 per image indexed
- 1000 photos = $1
- 100,000 photos = $100
- 1,000,000 photos = $1,000

**[NEED_DECISION]** Cost alert thresholds:

- Daily spend alert at $50? $100?
- Monthly budget cap?
- Per-photographer cost tracking?

**Mitigation:**

- Add CloudWatch alarm for Rekognition API costs
- Track `rekognition.index_faces.count` metric
- Consider per-photographer rate limiting for cost control

---

## 2. Lazy Collection Creation Risks (CRITICAL)

### 2.1 Race Condition on First Upload

**Evidence from plan (line 437):**

> "If `events.rekognition_collection_id` is NULL, create collection and save ID"

**Scenario:**

```
Time  Photo A (first)           Photo B (concurrent first)
T0    Check: collection = NULL
T1                               Check: collection = NULL
T2    CreateCollection('evt-1')
T3                               CreateCollection('evt-1') → AlreadyExistsException
T4    Update event.collection_id
T5                               Retry? Update again?
```

**[RISK]** Two concurrent first photos both try to create collection.

**Evidence from `rekognition/client.ts`:**

```typescript
export async function createCollection(
  client: RekognitionClient,
  eventId: string,
): Promise<string> {
  const collectionId = getCollectionId(eventId);
  const command = new CreateCollectionCommand({ CollectionId: collectionId });
  const response = await client.send(command);
  return response.CollectionArn ?? collectionId;
}
```

**Current implementation:** NOT idempotent (throws on AlreadyExistsException).

**Mitigation required:**

```typescript
try {
  const arn = await createCollection(client, eventId);
  await updateEventCollectionId(db, eventId, collectionId);
} catch (error) {
  if (error.name === 'ResourceAlreadyExistsException') {
    // Collection exists, continue with IndexFaces
    console.log(`Collection ${collectionId} already exists, continuing`);
  } else {
    throw error;
  }
}
```

### 2.2 Collection ID Persistence Failure

**[RISK]** Collection created in AWS but DB update fails:

```
1. CreateCollection succeeds
2. Database update fails (connection timeout, transaction rollback)
3. Photo retry sees NULL collection_id, tries to create again
4. AlreadyExistsException
```

**Mitigation:**

```typescript
// Option A: Check AWS first (extra API call)
try {
  await createCollection(client, eventId);
} catch (error) {
  if (error.name === 'ResourceAlreadyExistsException') {
    // OK, collection exists
  }
}

// Then update DB
await updateEventCollectionId(db, eventId, collectionId);
```

**Recommended approach:** Wrap in database transaction:

```typescript
await db.transaction(async (tx) => {
  const [event] = await tx
    .select({ collectionId: events.rekognitionCollectionId })
    .from(events)
    .where(eq(events.id, eventId))
    .for('update'); // Lock row

  if (!event.collectionId) {
    try {
      await createCollection(client, eventId);
    } catch (err) {
      if (err.name !== 'ResourceAlreadyExistsException') throw err;
    }

    await tx
      .update(events)
      .set({ rekognitionCollectionId: collectionId })
      .where(eq(events.id, eventId));
  }
});
```

**[COUPLING]** Collection creation logic couples queue consumer to events table. Any event schema change affects queue consumer.

---

## 3. Image Transformation Risks

### 3.1 HEIC/WebP Transformation via Cloudflare Images

**Evidence from T-16 alignment changes:**

> "Current: Store originals, transform in consumer (T-17)"

**[MAJOR CHANGE]** T-16 alignment document shows that T-16 was changed to normalize images BEFORE upload. This means:

**T-16 NOW uploads normalized JPEG only (not originals)**

- Evidence: `alignment-changes.md` lines 273-286
- Photos table `r2_key` always points to `.jpg` file
- No transformation needed in T-17

**[GAP]** T-17 plan says "fetch normalized JPEG from R2" but doesn't explicitly state that transformation is NOT needed in consumer.

**Updated flow for T-17:**

```
1. Fetch normalized JPEG from R2 (already JPEG, no transformation)
2. Call Rekognition IndexFaces directly (no format conversion)
3. Store faces in DB
4. Update photo status to 'indexed'
```

**[RESOLVED RISK]** Original plan had consumer doing HEIC→JPEG transformation. T-16 changes mean this is already done on upload.

### 3.2 Image Fetch Failures

**[RISK]** R2 object not found or corrupted:

```typescript
const object = await env.PHOTOS_BUCKET.get(job.r2_key);

if (!object) {
  return {
    message,
    data: null,
    error: new Error(`Image not found: ${job.r2_key}`),
  };
}
```

**Current handling:** Treats as error, will retry up to 3 times, then DLQ.

**[RISK]** If photo was deleted from R2 but DB record exists, retries won't help.

**Mitigation:** Mark as non-retryable:

```typescript
if (!object) {
  // Non-retryable - R2 object missing
  message.ack(); // Don't retry
  await markPhotoAsFailed(db, job.photo_id, 'R2 object not found');
  return;
}
```

---

## 4. Database Persistence Risks

### 4.1 Face Records Insertion

**Evidence from schema (`faces.ts`):**

```typescript
export const faces = pgTable('faces', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  photoId: uuid('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'restrict' }),
  rekognitionFaceId: text('rekognition_face_id'), // Nullable
  boundingBox: jsonb('bounding_box').$type<BoundingBox>(),
  rekognitionResponse: jsonb('rekognition_response').$type<RekognitionFaceRecord>(),
  indexedAt: timestamptz('indexed_at').defaultNow().notNull(),
});
```

**[RISK]** IndexFaces can return 0 faces (no faces detected). Must handle:

```typescript
const result = await indexFaces(client, eventId, imageBytes, photoId);

if (result.faceRecords.length === 0) {
  // No faces detected - NOT an error
  await db.update(photos).set({ status: 'indexed', faceCount: 0 }).where(eq(photos.id, photoId));
  message.ack();
  return;
}

// Insert face records
await db.insert(faces).values(
  result.faceRecords.map((faceRecord) => ({
    photoId,
    rekognitionFaceId: faceRecord.Face?.FaceId,
    boundingBox: faceRecord.Face?.BoundingBox,
    rekognitionResponse: faceRecord,
  })),
);
```

**[RISK]** Rekognition response has optional fields. `Face?.FaceId` may be undefined.

**Evidence from schema:** `rekognitionFaceId` is nullable (good), but should validate presence:

```typescript
if (!faceRecord.Face?.FaceId) {
  console.warn(`Face record missing FaceId for photo ${photoId}`);
  // Still insert (valuable for debugging), but log warning
}
```

### 4.2 Transaction Atomicity

**[RISK]** Face insertion and photo status update must be atomic:

```
1. Insert 5 faces
2. Update photo status to 'indexed'
3. Database connection fails between steps
4. Result: Faces inserted, photo still 'processing'
```

**Mitigation:** Wrap in transaction:

```typescript
await db.transaction(async (tx) => {
  // Insert faces
  await tx.insert(faces).values(faceRecords);

  // Update photo
  await tx
    .update(photos)
    .set({ status: 'indexed', faceCount: faceRecords.length })
    .where(eq(photos.id, photoId));
});

// Only ack message AFTER transaction commits
message.ack();
```

**[RISK]** If transaction fails, message is retried. Could cause duplicate face inserts.

**Mitigation:** Check if photo already indexed:

```typescript
const [photo] = await db
  .select({ status: photos.status })
  .from(photos)
  .where(eq(photos.id, photoId));

if (photo.status === 'indexed') {
  // Already processed (retry of successful job)
  message.ack();
  return;
}
```

### 4.3 Partial Success Handling

**[RISK]** IndexFaces returns both `faceRecords` (successful) and `unindexedFaces` (failed). Should we:

- A) Store only successful faces, mark photo as 'indexed'
- B) Store only successful faces, mark photo as 'failed' if any faces unindexed
- C) Store both, include unindexed faces in metadata

**Evidence from schema:** No field for unindexed faces.

**[NEED_DECISION]** How to handle photos with some faces unindexed?

**Recommendation:** Option A (ignore unindexed faces for MVP):

```typescript
// Store only successfully indexed faces
await db.insert(faces).values(result.faceRecords.map(/* ... */));

// Log unindexed for monitoring
if (result.unindexedFaces.length > 0) {
  console.warn(
    `Photo ${photoId} has ${result.unindexedFaces.length} unindexed faces`,
    result.unindexedFaces.map((f) => f.Reasons),
  );
}
```

---

## 5. Queue Consumer Extension Risks

### 5.1 Existing Consumer Modification

**Evidence from `photo-consumer.ts` line 152:**

```typescript
} else {
  // TODO: Application layer will handle DB writes here
  message.ack();
}
```

**[COUPLING]** T-17 must replace this placeholder WITHOUT breaking existing retry/error logic.

**Recommended structure:**

```typescript
} else {
  // SUCCESS: IndexFaces completed
  try {
    // Application layer: T-17 additions
    await processIndexFacesResult(data, job, c.env);
    message.ack();
  } catch (dbError) {
    // Database errors should retry
    console.error(`DB error for ${job.photo_id}:`, dbError);
    message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
  }
}
```

**[RISK]** Database errors inside success branch aren't classified (not in `isRetryableError`).

**Mitigation:** Add database error classification:

```typescript
function isDatabaseError(error: unknown): boolean {
  if (!isError(error)) return false;
  return (
    error.name === 'PostgresError' ||
    error.message.includes('database') ||
    error.message.includes('connection')
  );
}
```

### 5.2 Batch Processing and Partial Failures

**Evidence from consumer:**

```typescript
const results = await Promise.all(
  batch.messages.map(async (message, index): Promise<ProcessingResult> => {
    // Process each photo
  }),
);
```

**[RISK]** One database connection handles all batch writes. If 49/50 photos succeed and 1 fails due to DB timeout:

- 49 photos: ack'd, won't retry
- 1 photo: retried, may succeed next time

**BUT:** Each message has independent result, so this is OK.

**[RISK]** Database connection pool exhaustion if batch size is 50 and each message opens DB transaction.

**Evidence from DB client (`packages/db/src/client.ts`):** Connection pool size not specified (defaults to 1 for serverless).

**Mitigation:** Ensure database client uses connection pooling:

```typescript
// In createDbClient() - verify this exists
const client = neon(DATABASE_URL, { poolQueryViaFetch: true });
```

---

## 6. Monitoring and Observability Risks

### 6.1 Missing Metrics

**Evidence from plan:**

> "Monitor Rekognition API errors, Monitor rate limiter DO"

**[GAP]** No metrics implementation exists. Need to add:

```typescript
// Success metrics
ctx.waitUntil(
  analytics.track('rekognition.index_faces.success', {
    photo_id: job.photo_id,
    face_count: result.faceRecords.length,
    unindexed_count: result.unindexedFaces.length,
  }),
);

// Error metrics
ctx.waitUntil(
  analytics.track('rekognition.index_faces.error', {
    photo_id: job.photo_id,
    error_type: error.name,
    retryable: isRetryableError(error),
  }),
);
```

**[HI_GATE]** What analytics service should be used? Options:

- Cloudflare Analytics Engine
- Custom logging to R2
- Third-party (Sentry, Datadog)

### 6.2 DLQ Photo Recovery

**[RISK]** Photos that fail all retries go to DLQ and become invisible to photographer.

**Evidence from plan:** No DLQ monitoring mechanism defined.

**[NEED_DECISION]** DLQ handling strategy:

- A) Alert + manual investigation (requires on-call)
- B) Automatic retry with longer backoff (24 hours later)
- C) Mark photo as 'failed' in DB with reason (visible to photographer)

**Recommendation:** Option C for MVP:

```typescript
// In DLQ consumer (new worker)
export async function dlq(batch: MessageBatch<PhotoJob>, env: Env) {
  for (const message of batch.messages) {
    await db
      .update(photos)
      .set({
        status: 'failed',
        // Store error reason if schema supports it
      })
      .where(eq(photos.id, message.body.photo_id));

    message.ack();
  }
}
```

---

## 7. Security and Data Privacy Risks

### 7.1 AWS Credentials Management

**Evidence from consumer:**

```typescript
const client = createRekognitionClient({
  AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: env.AWS_REGION,
});
```

**[SECURITY]** AWS credentials stored as Cloudflare secrets (correct), but:

- No rotation policy documented
- No audit logging of credential usage
- No least-privilege IAM policy specified

**Mitigation:**

```json
// Recommended IAM policy (least privilege)
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateCollection",
        "rekognition:IndexFaces",
        "rekognition:DeleteCollection"
      ],
      "Resource": "*"
    }
  ]
}
```

**[HI_GATE]** Should AWS credentials be rotated? How often?

### 7.2 Face Data Retention

**Evidence from plan:**

> "Full Rekognition response stored (JSONB) for model training"

**[PRIVACY]** Face biometric data is PII under PDPA. Storing full response includes:

- Bounding box (location)
- Landmarks (eye/nose/mouth positions)
- Attributes (age, gender, emotions)

**[NEED_DECISION]** Is storing full response compliant with PDPA consent?

**Evidence from schema:** `rekognitionResponse` JSONB column exists.

**Recommendation:** Verify PDPA consent covers:

- Face detection
- Biometric data storage
- Data retention period (plan says "forever")

**[RISK]** If PDPA doesn't cover biometric storage, need to:

- Remove sensitive attributes from stored response
- Add data deletion on user request

---

## 8. Cost and Performance Risks

### 8.1 Rekognition API Costs

**Per-photo cost calculation:**

- IndexFaces: $0.001 per image
- Collection storage: ~$0.01 per 1000 faces per month
- Collection deleted after 30 days (per plan)

**[RISK]** High volume events:

- 10,000 photos = $10 Rekognition + storage
- 100,000 photos = $100 Rekognition + storage

**No revenue protection:** Photographer pays credits (platform cost), but Rekognition cost is platform expense.

**[HI_GATE]** Should credit pricing account for Rekognition costs?

- Current: Photographer pays platform-defined credit price
- Risk: Platform loses money if Rekognition costs exceed credit revenue

### 8.2 Queue Backlog Under Load

**Evidence from plan:**

- Max batch size: 50
- Processing rate: ~50 photos/second (with 20ms pacing)

**[RISK]** Large event uploads:

- 1000 photos uploaded in 60 seconds
- Queue processes at 50 photos/second
- Backlog cleared in ~20 seconds (OK)

**BUT:** Multiple photographers uploading concurrently:

- 10 photographers × 1000 photos each = 10,000 photos
- Processing time: 200 seconds (~3 minutes)
- Acceptable for MVP

**[PERF]** If demand exceeds 50 TPS sustained:

- Queue backlog grows
- Face detection delays increase
- Photographer experience degrades (photos stay "processing" longer)

**Mitigation:**

- Monitor queue depth (alert if > 1000)
- Consider multiple AWS accounts/regions for higher TPS
- Add UI indicator: "Detecting faces, may take 5-10 minutes"

---

## 9. Human-in-Loop Gates

### [HI_GATE] 9.1 Collection Creation Idempotency

**Question:** Should lazy collection creation handle race conditions by:

- A) Database row lock (serializes creation, slower)
- B) AWS AlreadyExistsException handling (faster, more complex)
- C) Pre-check AWS collection existence (extra API call)

**Recommendation:** Option B (handle AlreadyExistsException)

### [HI_GATE] 9.2 Unindexed Faces Handling

**Question:** When IndexFaces returns unindexed faces (low quality, too small, etc.), should we:

- A) Ignore, store only successful faces
- B) Mark photo as 'failed'
- C) Store metadata about unindexed faces

**Recommendation:** Option A for MVP (log for monitoring)

### [HI_GATE] 9.3 DLQ Recovery Process

**Question:** How should photos in DLQ be handled?

- A) Manual investigation + retry
- B) Automatic mark as 'failed' in DB
- C) Automatic retry after 24 hours

**Recommendation:** Option B (make visible to photographer)

### [HI_GATE] 9.4 Rekognition Cost Alerts

**Question:** What cost thresholds trigger alerts?

- Daily spend: $50? $100?
- Monthly budget cap?

**Recommendation:** Start with $100/day alert, review after first month

### [HI_GATE] 9.5 PDPA Compliance for Biometric Data

**Question:** Does current PDPA consent cover storing full Rekognition response (face landmarks, attributes)?

**Impact:** May need to remove sensitive attributes or get additional consent

---

## 10. Gaps and Missing Requirements

### [GAP] 10.1 DLQ Consumer Not Implemented

**Current state:** DLQ configured in `wrangler.jsonc` but no consumer defined.

**Action needed:** Create DLQ consumer to mark failed photos:

```typescript
// New file: apps/api/src/queue/photo-dlq-consumer.ts
export async function dlq(batch: MessageBatch<PhotoJob>, env: Env) {
  const db = createDbClient(env.DATABASE_URL);

  for (const message of batch.messages) {
    await db.update(photos).set({ status: 'failed' }).where(eq(photos.id, message.body.photo_id));

    message.ack();
  }
}
```

### [GAP] 10.2 Collection Creation Error Handling

**Current `createCollection()` function:** Throws on all errors, not idempotent.

**Action needed:** Make idempotent:

```typescript
export async function createCollectionIdempotent(
  client: RekognitionClient,
  eventId: string,
): Promise<string> {
  try {
    return await createCollection(client, eventId);
  } catch (error) {
    if (error.name === 'ResourceAlreadyExistsException') {
      return getCollectionId(eventId);
    }
    throw error;
  }
}
```

### [GAP] 10.3 Photo Already Indexed Check

**Risk:** Retry of successful message causes duplicate processing.

**Action needed:** Add idempotency check at start of handler:

```typescript
const [photo] = await db
  .select({ status: photos.status })
  .from(photos)
  .where(eq(photos.id, job.photo_id));

if (photo.status === 'indexed') {
  message.ack(); // Already processed
  return;
}
```

### [GAP] 10.4 Metrics and Observability

**Current state:** No metrics tracking implemented.

**Action needed:** Add metrics for:

- `rekognition.collection.created` (count)
- `rekognition.index_faces.success` (count, with face_count dimension)
- `rekognition.index_faces.zero_faces` (count)
- `rekognition.index_faces.error` (count, with error_type dimension)
- `queue.dlq.size` (gauge - for alerting)

---

## 11. Merge Conflict Hotspots

### 11.1 `apps/api/src/queue/photo-consumer.ts`

**Risk Level:** HIGH

**Current state:** Infrastructure exists, placeholder for application logic (line 152).

**T-17 changes:** Replace placeholder with collection creation + face persistence.

**Conflict potential:** MEDIUM (if any other task modifies queue consumer)

**Mitigation:** T-17 is the only task that extends consumer (T-16 only enqueues).

### 11.2 `packages/db/src/schema/events.ts`

**Risk Level:** LOW

**T-17 changes:** Read-only usage (check collection_id, update if NULL).

**Conflict potential:** LOW (schema changes would affect many tasks).

### 11.3 `packages/db/src/schema/faces.ts`

**Risk Level:** LOW

**T-17 changes:** Insert face records.

**Conflict potential:** LOW (no other task uses faces table yet).

---

## 12. Test Coverage Requirements

### 12.1 Unit Tests (Required)

**Collection creation:**

1. First photo creates collection
2. Subsequent photos reuse collection
3. AlreadyExistsException handled gracefully
4. Database update failure retries correctly

**Face persistence:**

1. Multiple faces inserted in transaction
2. Zero faces handled (no DB insert)
3. Unindexed faces logged but not stored
4. Photo status updated atomically with face inserts

**Error classification:**

1. Throttling errors trigger rate limiter backoff
2. Non-retryable errors ack immediately
3. Database errors retry with backoff
4. R2 object not found treated as non-retryable

### 12.2 Integration Tests (Required)

**Full flow:**

1. First photo in event: create collection + index faces + insert faces
2. Second photo in event: reuse collection + index faces
3. Photo with no faces: mark as indexed with face_count=0
4. Photo with unindexed faces: log warning, store successful faces

**Error scenarios:**

1. Rekognition throttle: retry with backoff
2. Collection creation fails: retry entire operation
3. Database timeout during face insert: retry (idempotent)
4. R2 object not found: ack immediately (don't retry)

### 12.3 Manual Testing

**Real data:**

1. Upload photo with 1 face (verify face record created)
2. Upload photo with multiple faces (verify all faces stored)
3. Upload photo with no faces (verify face_count=0, status='indexed')
4. Upload 100 photos rapidly (verify rate limiting works)

**Error injection:**

1. Delete R2 object before processing (verify non-retryable handling)
2. Mock Rekognition throttle (verify backoff + retry)
3. Mock database timeout (verify retry + idempotency)

---

## 13. Implementation Checklist

**Prerequisites:**

- [ ] T-16 (Upload API) complete and deployed
- [ ] Database schema (events, photos, faces) migrated
- [ ] AWS credentials (IAM policy with least privilege)
- [ ] R2 bucket accessible from queue consumer
- [ ] Rate limiter DO deployed and tested

**Collection creation:**

- [ ] Implement idempotent collection creation
- [ ] Add database transaction for collection ID persistence
- [ ] Handle AlreadyExistsException gracefully
- [ ] Add logging for collection creation events

**Face persistence:**

- [ ] Fetch normalized JPEG from R2 (no transformation needed)
- [ ] Call IndexFaces with photo data
- [ ] Insert face records in transaction with photo update
- [ ] Handle zero faces case (face_count=0, status='indexed')
- [ ] Log unindexed faces for monitoring

**Error handling:**

- [ ] Add idempotency check (already indexed?)
- [ ] Classify database errors as retryable
- [ ] Treat R2 not found as non-retryable
- [ ] Handle ResourceNotFoundException for deleted collection

**Observability:**

- [ ] Add success metrics (face_count, processing time)
- [ ] Add error metrics (error_type, retryable status)
- [ ] Log collection creation events
- [ ] Log unindexed faces warnings

**DLQ handling:**

- [ ] Create DLQ consumer to mark photos as failed
- [ ] Add DLQ size alert (> threshold)
- [ ] Document manual retry process

---

## 14. Dependencies and Blockers

**Upstream dependencies (must be complete):**

- T-16: Photo upload API ✓ (in PR #24)
- T-1: Database schema ✓ (complete)

**Downstream tasks (blocked on T-17):**

- T-20: Rekognition cleanup cron
- (Future) Selfie search feature

**External dependencies:**

- AWS Rekognition service availability
- Cloudflare R2 bucket (PHOTOS_BUCKET)
- Rate limiter Durable Object deployed

**Configuration needed:**

- `AWS_ACCESS_KEY_ID` secret
- `AWS_SECRET_ACCESS_KEY` secret
- `AWS_REGION` environment variable (us-west-2)

---

## 15. Observability and Monitoring

### Metrics to Track

**Success metrics:**

- `rekognition.collection.created` (count) - New collections
- `rekognition.index_faces.success` (count) - Successful indexing
- `rekognition.faces_indexed` (histogram) - Face count distribution
- `rekognition.processing_time` (histogram) - End-to-end latency

**Error metrics:**

- `rekognition.index_faces.error` (count by error_type)
- `rekognition.throttle` (count) - Throttling events
- `rekognition.zero_faces` (count) - Photos with no faces
- `queue.dlq.size` (gauge) - DLQ backlog

### Alerts to Configure

**Critical (page on-call):**

- Rekognition API errors > 10% of requests (15m window)
- DLQ size > 100 photos
- Daily Rekognition spend > $100

**Warning (email/Slack):**

- Zero faces > 50% of photos (indicates bad uploads)
- Collection creation failures > 5 in 1 hour
- Queue depth > 1000 messages

### Logs to Emit

**Success:**

```json
{
  "event": "rekognition.index_faces.success",
  "photo_id": "uuid",
  "event_id": "uuid",
  "collection_id": "uuid",
  "face_count": 3,
  "unindexed_count": 1,
  "processing_time_ms": 456
}
```

**Error:**

```json
{
  "event": "rekognition.index_faces.error",
  "photo_id": "uuid",
  "error_type": "ThrottlingException",
  "retryable": true,
  "retry_attempt": 2
}
```

---

## 16. Rollback Strategy

**If T-17 causes production issues:**

1. **Queue pause:**
   - Stop PHOTO_QUEUE consumer (comment out queue handler)
   - Photos remain in 'processing' status (safe)
   - Resume after fix deployed

2. **Code rollback:**
   - Revert T-17 PR
   - Re-deploy consumer with placeholder
   - Photos stay in queue, will process after fix

3. **Data cleanup:**
   - Photos with status='processing' forever: manual investigation
   - Face records with wrong data: delete + reprocess from queue
   - Rekognition collections: can delete and recreate (30-day retention plan)

**Rollback NOT possible:**

- AWS Rekognition collections (deletion is permanent)
- Face records in DB (soft delete required)
- Rekognition API costs already incurred

---

## 17. Summary of Major Risks

| Risk                                  | Severity | Likelihood | Mitigation                                               |
| ------------------------------------- | -------- | ---------- | -------------------------------------------------------- |
| Race condition on collection creation | Medium   | High       | Idempotent creation with AlreadyExistsException handling |
| Rekognition rate limit exceeded       | High     | Medium     | Existing rate limiter DO, monitoring alerts              |
| Database transaction failure          | Medium   | Low        | Idempotency check, retry logic                           |
| AWS credential compromise             | Critical | Very Low   | Least-privilege IAM, secret rotation policy              |
| Cost overrun                          | Medium   | Medium     | Daily spend alerts, per-photo cost tracking              |
| DLQ backlog invisible to users        | Medium   | Low        | DLQ consumer marks photos as failed                      |
| PDPA non-compliance                   | High     | Low        | Legal review of biometric data storage                   |

---

## References

**Task definition:**

- `docs/logs/BS_0001_S-1/tasks.md` (T-17 section, lines 427-454)

**Related tasks:**

- T-16: Photo upload API (upstream, produces queue jobs)
- T-18: Gallery API (displays indexed photos)
- T-20: Rekognition cleanup cron (deletes old collections)

**Plan:**

- `docs/logs/BS_0001_S-1/plan/final.md` (lines 326-346: US-8 face detection flow)

**Research:**

- `docs/logs/BS_0001_S-1/research/heic-rekognition.md` (HEIC transformation approach)

**Codebase:**

- `apps/api/src/queue/photo-consumer.ts` (existing infrastructure)
- `apps/api/src/lib/rekognition/client.ts` (Rekognition SDK wrapper)
- `apps/api/src/lib/rekognition/errors.ts` (Error classification)
- `packages/db/src/schema/faces.ts` (Face schema)
- `packages/db/src/schema/events.ts` (Events schema with collection ID)
- `packages/db/src/schema/photos.ts` (Photos schema with status)

**T-16 alignment:**

- `docs/logs/BS_0001_S-1/implementation/T-16/alignment-changes.md` (Normalization strategy change)
