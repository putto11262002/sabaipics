# 005 - Rekognition Queue Infrastructure

**Date:** 2025-12-08
**Branch:** `feat/rekognition-queue-setup`
**Status:** Complete (Infrastructure only)

---

## Summary

Set up infrastructure for AWS Rekognition integration:

- Queue consumer with retry/error handling
- Rate limiter Durable Object (50 TPS pacing)
- Rekognition SDK client wrapper
- Error classification utilities

**Infrastructure layer does:**

- Fetch image from R2
- Call Rekognition IndexFaces
- Return SDK types (`FaceRecord[]`, `UnindexedFace[]`)

**Application layer handles (NOT here):**

- Save faces to DB
- Update photo status
- WebSocket notifications

---

## Files Created

| File                                  | Purpose                                        |
| ------------------------------------- | ---------------------------------------------- |
| `src/types/photo-job.ts`              | PhotoJob, RateLimiterResponse types            |
| `src/lib/rekognition/errors.ts`       | Error classification, backoff calculation      |
| `src/lib/rekognition/client.ts`       | SDK client wrapper, indexFaces, collection ops |
| `src/lib/rekognition/index.ts`        | Re-exports for clean imports                   |
| `src/durable-objects/rate-limiter.ts` | DO for pacing at 50 TPS                        |
| `src/queue/photo-consumer.ts`         | Queue handler with processPhoto implementation |

---

## Files Modified

| File             | Changes                                       |
| ---------------- | --------------------------------------------- |
| `wrangler.jsonc` | Added R2, Queue, DO bindings + nodejs_compat  |
| `tsconfig.json`  | Added @cloudflare/workers-types               |
| `package.json`   | Added @aws-sdk/client-rekognition             |
| `src/index.ts`   | Export DO, add queue handler, update Bindings |
| `.dev.vars`      | Added AWS credential placeholders             |

---

## Refactoring (Session 2)

Simplified by using AWS SDK types directly instead of custom parsing.

**Removed:**

- `src/lib/rekognition-parser.ts` - not needed, use SDK types

**Reorganized:**

- `src/lib/rekognition-errors.ts` → `src/lib/rekognition/errors.ts`

**Key decision:** No `ParsedFace` type. Use SDK's `FaceRecord` and `UnindexedFace` directly. Application layer handles mapping to DB schema.

---

## Final File Structure

```
apps/api/src/
├── lib/rekognition/
│   ├── index.ts        # Re-exports
│   ├── client.ts       # createRekognitionClient, indexFaces, createCollection, deleteCollection
│   └── errors.ts       # isRetryableError, isThrottlingError, getBackoffDelay
├── durable-objects/
│   └── rate-limiter.ts # RekognitionRateLimiter DO
├── queue/
│   └── photo-consumer.ts # createQueueHandler, processPhoto
└── types/
    └── photo-job.ts    # PhotoJob, RateLimiterResponse
```

---

## Wrangler Bindings

```
RATE_LIMITER      → RekognitionRateLimiter (DO)
PHOTO_QUEUE       → photo-processing (Queue producer)
PHOTOS_BUCKET     → sabaipics-photos (R2)
```

Queue consumer config:

- `max_batch_size`: 50
- `max_retries`: 3
- `dead_letter_queue`: photo-processing-dlq

**Auto-provisioning:** R2 bucket and Queues are automatically created on `wrangler deploy`. No need to manually create.

---

## Data Shapes

### PhotoJob (Queue Message)

```typescript
{
  photo_id: string; // UUID
  event_id: string; // UUID
  r2_key: string; // "{event_id}/{photo_id}.{ext}"
}
```

### IndexFacesResult (returned by processPhoto)

```typescript
{
  faceRecords: FaceRecord[];      // SDK type - indexed faces
  unindexedFaces: UnindexedFace[]; // SDK type - faces that couldn't be indexed
  faceModelVersion?: string;
}
```

### UnindexedFace Reasons

| Reason               | Meaning                      |
| -------------------- | ---------------------------- |
| `EXTREME_POSE`       | Head turned too far          |
| `EXCEEDS_MAX_FACES`  | Hit MaxFaces limit           |
| `LOW_BRIGHTNESS`     | Image too dark               |
| `LOW_SHARPNESS`      | Image too blurry             |
| `LOW_CONFIDENCE`     | Detection confidence too low |
| `SMALL_BOUNDING_BOX` | Face too small               |

---

## Rate Limiting Strategy

```
TPS Limit: 50 (us-west-2)
Safety: 90% → 45 effective TPS
Interval: 22ms between requests

Pacing via DO:
1. Consumer calls reserveBatch(batchSize)
2. DO returns {delay, intervalMs}
3. Consumer waits delay, then spaces requests by intervalMs
4. Back-to-back batches queue up
```

---

## Error Handling

| Error Type                                 | Action               |
| ------------------------------------------ | -------------------- |
| Throttling (ProvisionedThroughputExceeded) | Retry + report to DO |
| Non-retryable (InvalidImageFormat)         | Ack (don't retry)    |
| Retryable (InternalServerError)            | Retry with backoff   |
| Unknown                                    | Retry with backoff   |

Backoff: Exponential 2^n seconds, max 300s, ±20% jitter.

---

## AWS Credentials Setup

### Step 1: Create IAM User in AWS

```bash
# Create user
aws iam create-user --user-name sabaipics-rekognition

# Create access key (save the output!)
aws iam create-access-key --user-name sabaipics-rekognition

# Attach policy
aws iam put-user-policy \
  --user-name sabaipics-rekognition \
  --policy-name RekognitionAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "rekognition:IndexFaces",
        "rekognition:SearchFacesByImage",
        "rekognition:CreateCollection",
        "rekognition:DeleteCollection",
        "rekognition:ListFaces",
        "rekognition:DeleteFaces"
      ],
      "Resource": "*"
    }]
  }'
```

### Step 2: Set Secrets in Cloudflare

```bash
cd apps/api

# Staging
wrangler secret put AWS_ACCESS_KEY_ID --env staging
wrangler secret put AWS_SECRET_ACCESS_KEY --env staging

# Production
wrangler secret put AWS_ACCESS_KEY_ID --env production
wrangler secret put AWS_SECRET_ACCESS_KEY --env production
```

### Step 3: Local Development

Update `.dev.vars`:

```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### Step 4: GitHub Actions

Add to repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

---

## What's NOT Done (Next Steps)

1. **Upload endpoint** - POST /api/events/:id/photos
2. **Collection lifecycle** - Create on publish, delete on expiry
3. **DB migrations** - photos + faces tables
4. **Application layer** - Save faces to DB, update photo status, WebSocket

---

## Testing

Local dev works:

```bash
pnpm --filter=@sabaipics/api dev:local
# Shows all bindings recognized
```

Build passes:

```bash
pnpm --filter=@sabaipics/api build
# No TypeScript errors
```

---

## Dependencies Added

```json
{
  "dependencies": {
    "@aws-sdk/client-rekognition": "^3.x"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.x"
  }
}
```
