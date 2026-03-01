# Tech Docs Scout

Task: T-17 — Photo queue consumer (Rekognition indexing)
Root: BS_0001_S-1
Date: 2026-01-12

## Task Summary

**Goal:** Update queue consumer to create Rekognition collection on first photo, call IndexFaces, and store full response in DB.

**Type:** Feature (Jobs/Queue Worker)

**Primary Surface:** Jobs (Cloudflare Queue Consumer)

**Scope:** `apps/api/src/queue/photo-consumer.ts`

**Dependencies:** T-1 (DB Schema), T-16 (Photo Upload API)

## Tech Image / High-Level Governance

The project uses a symlinked `.claude` directory but the actual tech governance is documented in:

- `docs/tech/ARCHITECTURE.md` (component roles and interactions)
- `docs/tech/TECH_STACK.md` (technology choices)
- Existing code patterns (queue consumer, Rekognition lib, error handling)

**Gate rubric:** This is a GREEN task - extends existing queue consumer and Rekognition infrastructure, no new primitives needed.

## Architecture Context

### Cloudflare Workers Runtime

- **Platform:** Cloudflare Workers (compatibility_date: 2025-12-06)
- **Framework:** Hono ^4.10.7
- **Constraints:**
  - 10 MB compressed worker size (paid plan)
  - 128 MB memory per isolate
  - 5 min CPU time limit (sufficient for Rekognition calls ~1-3s each)
  - Stateless execution (no disk I/O, no persistent connections)

### Cloudflare Queues Configuration

From `apps/api/wrangler.jsonc`:

- **Queue name:** `photo-processing` (dev/prod), `photo-processing-staging` (staging)
- **Binding:** `PHOTO_QUEUE` (producer)
- **Consumer config:**
  - `max_batch_size: 50` (process up to 50 photos per batch)
  - `max_batch_timeout: 5` (seconds - trigger batch when timeout reached)
  - `max_retries: 3` (after 3 failures, send to DLQ)
  - `max_concurrency: 1` (single consumer instance at a time)
  - `dead_letter_queue: photo-processing-dlq` (for permanently failed jobs)

### AWS Rekognition Constraints

From `docs/tech/ARCHITECTURE.md` and research docs:

- **Region:** us-west-2 (configured in `wrangler.jsonc`)
- **Rate limit:** 50 TPS per operation (regional limit for IndexFaces)
- **Supported formats:** JPEG and PNG ONLY (HEIC/WebP NOT supported)
- **Max image size:** 5 MB raw bytes, 15 MB from S3
- **Collections:** One collection per event (identified by event UUID)

### R2 Storage

- **Binding:** `PHOTOS_BUCKET`
- **Key pattern:** `events/{event_id}/photos/{photo_id}` (normalized JPEG from T-16)
- **Public access:** Enabled via `PHOTO_R2_BASE_URL` for CF Images Transform
- **Object metadata:** `contentType` set to `image/jpeg` (normalized images only)

## Existing Infrastructure (DO NOT recreate)

### Queue Consumer Pattern

File: `apps/api/src/queue/photo-consumer.ts`

**Current implementation:**

- Handles photo-processing queue messages with rate limiting via Durable Object RPC
- Parallel request execution with paced initiation (20ms intervals = 50 TPS)
- Per-message ack/retry based on individual results
- Fetches image from R2
- Calls Rekognition IndexFaces
- Returns SDK types (FaceRecord[], UnindexedFace[])

**What's MISSING (T-17 must add):**

- Lines 152-154: "TODO: Application layer will handle DB writes here"
- No collection creation logic
- No database persistence of faces
- No photo status updates

**Pattern to follow:**

```typescript
// Existing structure (keep this):
export async function queue(
  batch: MessageBatch<PhotoJob>,
  env: CloudflareBindings,
  ctx: ExecutionContext,
): Promise<void> {
  // 1. Get rate limiter DO
  // 2. Reserve batch time slot
  // 3. Create Rekognition client
  // 4. Fire all requests with paced initiation
  // 5. Handle ack/retry based on results
}

// T-17 must fill in the TODO at line 152:
if (error) {
  // ... existing error handling ...
} else {
  // TODO: Application layer will handle DB writes here
  // T-17: Add collection creation, face persistence, photo status update
  message.ack();
}
```

### Rekognition Library

File: `apps/api/src/lib/rekognition/client.ts`

**Available functions:**

- `createRekognitionClient(env)` - Factory for RekognitionClient
- `createCollection(client, eventId)` - Creates new collection (returns ARN)
- `deleteCollection(client, eventId)` - Deletes collection
- `indexFaces(client, eventId, imageBytes, photoId)` - Indexes faces in image
- `getCollectionId(eventId)` - Helper: returns eventId as collection ID

**Key types:**

```typescript
interface IndexFacesResult {
  faceRecords: FaceRecord[];        // Successfully indexed faces
  unindexedFaces: UnindexedFace[];  // Faces rejected by Rekognition
  faceModelVersion?: string;
}

// FaceRecord structure (from AWS SDK):
{
  Face: {
    FaceId: string;              // Rekognition-generated face ID
    BoundingBox: { ... };
    Confidence: number;
    // ... other attributes
  },
  FaceDetail: {
    BoundingBox: { ... };
    AgeRange: { Low, High };
    Gender: { Value, Confidence };
    Emotions: [{ Type, Confidence }];
    // ... many more attributes
  }
}
```

**Image normalization:**
File: `apps/api/src/lib/images/normalize.ts`

T-16 already normalizes images to JPEG before storing in R2, so T-17 consumer receives JPEG images only. No format conversion needed in queue consumer.

### Error Handling Conventions

File: `apps/api/src/lib/rekognition/errors.ts`

**Error classification functions (already used in queue consumer):**

- `isRetryableError(error)` - Transient failures (throttling, server errors)
- `isNonRetryableError(error)` - Bad input (InvalidImageFormatException, ImageTooLargeException)
- `isThrottlingError(error)` - Specifically throttling errors
- `getBackoffDelay(attempts)` - Exponential backoff with jitter (2, 4, 8, ... 300s max)
- `getThrottleBackoffDelay(attempts)` - Longer backoff for throttling (5, 10, 20, ... 300s)
- `formatErrorMessage(error)` - Clean error message for logging

**Non-retryable errors (will NOT retry):**

- InvalidImageFormatException (wrong format)
- ImageTooLargeException (>5MB)
- InvalidParameterException (bad request)
- ResourceNotFoundException (collection doesn't exist - **T-17 must handle this**)
- AccessDeniedException (AWS credentials issue)

**Retryable errors (will retry with backoff):**

- ProvisionedThroughputExceededException (rate limited)
- ThrottlingException (rate limited)
- InternalServerError (AWS service issue)
- ServiceUnavailableException (AWS service issue)
- TimeoutError (network issue)

### Logging Conventions

From `docs/logs/BS_0001_S-1/context/repo-scout.md`:

- Use `console.log/warn/error` with structured prefixes
- Queue consumer uses `[Queue]` prefix
- Cloudflare observability enabled in staging/production (`head_sampling_rate: 1`)
- No structured logging library (use plain console methods)

**Example patterns:**

```typescript
console.log(`[Queue] Processing batch of ${batch.messages.length} photos`);
console.error(`[Queue] Throttled: ${job.photo_id} - ${errorMessage}`);
console.warn(`[Queue] Collection not found for event ${eventId}, creating...`);
```

## Database Schema (from T-1)

### Events Table

File: `packages/db/src/schema/events.ts`

```typescript
{
  id: uuid (PK)
  photographer_id: uuid (FK -> photographers.id)
  name: text
  rekognition_collection_id: text | null  // <-- T-17 MUST populate this
  created_at: timestamp
  expires_at: timestamp
  // ... other fields
}
```

**Key requirement:** `rekognition_collection_id` starts as NULL. T-17 must:

1. Check if NULL on first photo for an event
2. Create collection if NULL
3. Update event with collection ID
4. Use existing collection ID for subsequent photos

### Photos Table

File: `packages/db/src/schema/photos.ts`

```typescript
{
  id: uuid (PK)
  event_id: uuid (FK -> events.id)
  r2_key: text                    // Path in R2 bucket
  file_size: integer
  uploaded_at: timestamp
  status: text                    // 'processing' | 'indexed' | 'failed'
  face_count: integer             // <-- T-17 MUST populate this
  error_message: text | null      // <-- T-17 MUST populate on failure
  // ... other fields
}
```

**Key requirements:**

- Initial status: 'processing' (set by T-16)
- T-17 success: status='indexed', face_count=N (N can be 0)
- T-17 failure: status='failed', error_message='...'

### Faces Table

File: `packages/db/src/schema/faces.ts`

```typescript
{
  id: uuid (PK)
  photo_id: uuid (FK -> photos.id)
  event_id: uuid (FK -> events.id)
  rekognition_face_id: text       // FaceId from Rekognition FaceRecord
  rekognition_response: jsonb     // <-- Full FaceRecord object
  bounding_box: jsonb             // Extracted { x, y, width, height }
  confidence: numeric
  indexed_at: timestamp
}
```

**Key requirements:**

- Store FULL `FaceRecord` object in `rekognition_response` (JSONB)
- Extract `rekognition_face_id` from `FaceRecord.Face.FaceId`
- Extract `bounding_box` from `FaceRecord.Face.BoundingBox`
- Extract `confidence` from `FaceRecord.Face.Confidence`
- One row per detected face (even if 0 faces, no rows inserted)

## Must-Follow Patterns

### 1. Database Operations

**ORM:** Drizzle ORM ^0.45.0

**Database client access:**

```typescript
import { createDatabaseClient } from '@sabaipics/db';

// In queue consumer:
const db = createDatabaseClient(env.DATABASE_URL);
```

**Query patterns:**

```typescript
// Select single record
const event = await db
  .select()
  .from(events)
  .where(eq(events.id, eventId))
  .limit(1)
  .then((rows) => rows[0]);

// Update record
await db
  .update(photos)
  .set({ status: 'indexed', face_count: faceRecords.length })
  .where(eq(photos.id, photoId));

// Insert multiple records (faces)
await db.insert(faces).values(faceRows);

// Transaction (for collection creation + event update)
await db.transaction(async (tx) => {
  // Create collection
  // Update event
});
```

### 2. Collection Creation Strategy

**Problem:** First photo for an event needs to create Rekognition collection.

**Solution pattern:**

```typescript
// Check if collection exists
if (!event.rekognition_collection_id) {
  // Create collection
  const collectionArn = await createCollection(client, eventId);

  // Update event with collection ID
  await db
    .update(events)
    .set({ rekognition_collection_id: getCollectionId(eventId) })
    .where(eq(events.id, eventId));
}
```

**Edge case:** Multiple photos from same event processed concurrently might try to create collection twice. Handle `ResourceAlreadyExistsException`:

- Catch exception
- Log warning
- Continue with indexing (collection exists now)
- Update event record (idempotent)

### 3. Error Handling in Queue Consumer

**Existing pattern (keep this):**

```typescript
if (error) {
  const errorMessage = formatErrorMessage(error);
  const job = message.body;

  if (isThrottlingError(error)) {
    console.error(`[Queue] Throttled: ${job.photo_id} - ${errorMessage}`);
    hasThrottleError = true;
    message.retry({ delaySeconds: getThrottleBackoffDelay(message.attempts) });
  } else if (isNonRetryableError(error)) {
    console.error(`[Queue] Non-retryable: ${job.photo_id} - ${errorMessage}`);
    message.ack(); // Don't retry
  } else if (isRetryableError(error)) {
    console.error(`[Queue] Retryable: ${job.photo_id} - ${errorMessage}`);
    message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
  } else {
    console.error(`[Queue] Unknown error: ${job.photo_id} - ${errorMessage}`);
    message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
  }
}
```

**T-17 additions:**

- On non-retryable error: Update photo status='failed', error_message=errorMessage
- On retry: Leave photo status='processing'
- On success: Update photo status='indexed', face_count=N

### 4. Zero Faces Handling

From T-17 acceptance criteria:

> Handle no-faces case (face_count=0, still indexed)

**Pattern:**

```typescript
if (faceRecords.length === 0) {
  // No faces detected - this is OK
  await db
    .update(photos)
    .set({
      status: 'indexed',
      face_count: 0,
    })
    .where(eq(photos.id, photoId));

  console.log(`[Queue] No faces detected in photo ${photoId}`);
  // Still ack the message (success)
}
```

### 5. Unindexed Faces Logging

Rekognition may reject some faces (low quality, not a face, etc.). Log these for observability but don't fail the job:

```typescript
if (unindexedFaces.length > 0) {
  console.warn(
    `[Queue] ${unindexedFaces.length} faces not indexed in photo ${photoId}`,
    unindexedFaces.map((f) => f.Reasons).join(', '),
  );
}
```

## Testing Conventions

From `docs/logs/BS_0001_S-1/context/repo-scout.md`:

**Test framework:** Vitest ^3.2.0

**Workers tests:** Use `@cloudflare/vitest-pool-workers` for runtime tests

**Test patterns:**

- Unit tests: Mock Rekognition SDK with `aws-sdk-client-mock`
- Test file suffix: `*.workers.test.ts` for Workers runtime tests
- Config: Separate `vitest.config.ts` for Workers pool

**Test coverage for T-17:**

- Unit test with mock Rekognition response
- Test collection creation on first photo
- Test no-faces handling (faceRecords.length === 0)
- Test retry logic for retryable errors
- Test non-retryable error handling (status='failed')
- Test ResourceAlreadyExistsException handling (duplicate collection creation)

## Cloudflare Workers Constraints

### No File I/O

- Cannot use `fs` module
- All data must be in-memory (ArrayBuffer, Uint8Array)
- R2 bucket access via binding (`env.PHOTOS_BUCKET`)

### No Persistent Connections

- Each queue invocation is stateless
- Database client created per batch
- Rekognition client created per batch

### Memory Limits

- 128 MB per isolate
- Images already normalized to ≤4000px JPEG by T-16
- Batch size = 50 photos max
- Memory usage: ~50MB for 50 images (assuming 1MB avg per image)

### CPU Time Limits

- 5 min CPU time per invocation
- Rekognition IndexFaces: ~1-3s per image
- 50 photos × 3s = 150s max (well within limit)
- Paced initiation at 20ms intervals adds negligible time

## Integration Points

### Input (from T-16)

Queue message structure:

```typescript
interface PhotoJob {
  photo_id: string; // UUID
  event_id: string; // UUID
  r2_key: string; // "events/{event_id}/photos/{photo_id}"
}
```

### Output (to DB)

- Events: Update `rekognition_collection_id` (once per event)
- Photos: Update `status`, `face_count`, `error_message`
- Faces: Insert rows (one per detected face)

### Error Handling

- Retryable errors: Message retried with exponential backoff
- Non-retryable errors: Photo marked as failed, message acked
- DLQ: After 3 retries, message sent to `photo-processing-dlq`

## Risk Areas

### 1. Concurrent Collection Creation

**Risk:** Multiple photos from same event processed concurrently, both try to create collection.

**Mitigation:**

- Handle `ResourceAlreadyExistsException` gracefully
- Use idempotent event update (SET collection_id WHERE id=event_id)
- Log warning but continue processing

### 2. Database Transaction Failures

**Risk:** Collection created in Rekognition but event update fails → orphaned collection.

**Mitigation:**

- Not critical for MVP (orphaned collections cleaned up by T-20 cron job)
- Collection ID is deterministic (event_id), so can re-create event record association

### 3. Partial Batch Failures

**Risk:** Some photos succeed, some fail in same batch.

**Mitigation:**

- Already handled by existing queue consumer pattern (per-message ack/retry)
- T-17 adds DB updates per message (no batch-level transactions needed)

### 4. Rekognition Rate Limiting

**Risk:** 50 TPS limit exceeded despite pacing.

**Mitigation:**

- Already handled by existing rate limiter DO
- Queue consumer reports throttle errors to DO
- DO adjusts pacing dynamically

## References

### Codebase Files

- `apps/api/src/queue/photo-consumer.ts` - Existing queue consumer (lines 152-154: TODO)
- `apps/api/src/lib/rekognition/client.ts` - Rekognition SDK wrapper
- `apps/api/src/lib/rekognition/errors.ts` - Error classification
- `packages/db/src/schema/events.ts` - Events table schema
- `packages/db/src/schema/photos.ts` - Photos table schema
- `packages/db/src/schema/faces.ts` - Faces table schema
- `apps/api/wrangler.jsonc` - Queue configuration

### Research Docs

- `docs/logs/BS_0001_S-1/research/heic-rekognition.md` - HEIC support research (confirms T-16 normalization)
- `docs/logs/BS_0001_S-1/context/repo-scout.md` - Codebase conventions
- `docs/logs/BS_0001_S-1/context/surface-map.md` - Touch points map

### External Docs

- AWS Rekognition IndexFaces: https://docs.aws.amazon.com/rekognition/latest/dg/API_IndexFaces.html
- AWS Rekognition Limits: https://docs.aws.amazon.com/rekognition/latest/dg/limits.html
- Cloudflare Queues: https://developers.cloudflare.com/queues/
- Cloudflare Workers Limits: https://developers.cloudflare.com/workers/platform/limits/

## Notes

- The queue consumer infrastructure is mature and well-tested (existing implementation)
- T-17 is primarily about filling in the TODO at line 152 (DB persistence layer)
- No new infrastructure primitives needed (GREEN task)
- Follow existing error handling patterns strictly
- Collection creation is a one-time operation per event (happens on first photo)
- Zero faces is a valid outcome (not an error)
- Full Rekognition response stored in JSONB for future flexibility (e.g., age range, emotions)
