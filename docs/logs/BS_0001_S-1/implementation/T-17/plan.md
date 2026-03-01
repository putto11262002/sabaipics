# Implementation Plan

Task: `T-17 — Photo queue consumer (Rekognition indexing)`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-12`
Owner: `Claude (implementv3)`

## Inputs

- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: T-17)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-17/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-17/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-17/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-17/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-17/context/risk-scout.md`

## Goal / non-goals

**Goal:**

- Update the existing queue consumer to create Rekognition collections on first photo, call IndexFaces API, and persist face data to the database
- Handle success (0+ faces), retryable errors, and non-retryable errors appropriately
- Update photo status from 'uploading' → 'indexing' → 'indexed' or 'failed'
- Track error retryability with new `retryable` field
- **Update T-16 to use 'uploading' status** (clearer UX than 'processing')

**Non-goals:**

- DLQ consumer implementation (out of scope - can be separate task)
- Cost monitoring/alerting infrastructure (ops concern, not part of MVP)
- PDPA compliance verification (legal review, not technical implementation)
- Collection deletion (handled by T-20)

## Approach (data-driven)

### Evidence-Based Design

**Key discovery from context gathering:**

- T-16 was modified to normalize images to JPEG on upload (confirmed in alignment-changes.md)
- Queue consumer infrastructure already exists at `apps/api/src/queue/photo-consumer.ts` with lines 152-154 marked as TODO
- Rate limiter DO, Rekognition client, and error classification already implemented
- T-17 is primarily about **filling the application layer gap** (database persistence)

**Schema changes required (feedback from review):**

- Change T-16 status from 'processing' to **'uploading'** (clearer UX)
- Add `'indexing'` status to photo statuses enum
- Add `retryable` field (boolean | null, default null) to track error retryability
- Do NOT use transactions (Neon driver limitation)

### Status Flow

```
T-16:         'uploading'   → Photo being uploaded, normalized, enqueued
T-17 start:   'indexing'    → About to call IndexFaces
T-17 success: 'indexed'     → Faces stored, retryable=null, error_message=null
T-17 retry:   'indexing'    → Retryable error, retryable=true, error_message set
T-17 fail:    'failed'      → Non-retryable error, retryable=false, error_message set
```

### Retryable Field Logic

| Scenario            | status     | retryable | error_message                      |
| ------------------- | ---------- | --------- | ---------------------------------- |
| Success             | 'indexed'  | null      | null                               |
| Retryable error     | 'indexing' | true      | 'ThrottlingException: ...'         |
| Non-retryable error | 'failed'   | false     | 'InvalidImageFormatException: ...' |

**Benefits:**

- `null` = no error (clean success state)
- `true` = failed but will retry (temp issue)
- `false` = permanent failure (bad image, etc.)
- Query for stuck photos: `WHERE status='indexing' AND retryable=true AND error_message IS NOT NULL`

### Implementation Strategy

**1. Update database schema**

File: `packages/db/src/schema/photos.ts`

Update status enum (add 'uploading' + 'indexing'):

```typescript
export const photoStatuses = [
  'uploading', // T-16: Upload phase (CHANGED from 'processing')
  'indexing', // T-17: Face detection phase (NEW)
  'indexed', // Success
  'failed', // Non-retryable error
] as const;
```

Add `retryable` field:

```typescript
export const photos = pgTable('photos', {
  // ... existing fields
  status: text('status')
    .notNull()
    .check(sql`status = ANY(ARRAY['uploading', 'indexing', 'indexed', 'failed'])`),

  retryable: boolean('retryable'), // null=success, true=retryable, false=non-retryable

  errorMessage: text('error_message'),
  // ...
});
```

**Migration steps:**

1. Run `pnpm --filter=@sabaipics/db db:generate` to create migration
2. User will run `db:push` or `db:migrate` manually

---

**2. Update T-16 upload endpoint**

File: `apps/api/src/routes/photos.ts` (upload endpoint)

Change status from 'processing' to 'uploading':

```typescript
// OLD:
const photo = await tx.insert(photos).values({
  // ...
  status: 'processing', // OLD
  // ...
});

// NEW:
const photo = await tx.insert(photos).values({
  // ...
  status: 'uploading', // NEW - clearer UX
  // ...
});
```

---

**3. Extend existing queue consumer**

File: `apps/api/src/queue/photo-consumer.ts` (lines 152-154)

Replace:

```typescript
} else {
  // TODO: Application layer will handle DB writes here
  message.ack();
}
```

With:

```typescript
} else {
  // SUCCESS: IndexFaces completed
  try {
    await persistFacesAndUpdatePhoto(db, job, data);
    message.ack();
  } catch (dbError) {
    // Database errors are retryable
    console.error(`[Queue] Database error for ${job.photo_id}:`, dbError);

    // Mark as retryable error
    try {
      await db
        .update(photos)
        .set({
          retryable: true,
          errorMessage: String(dbError).slice(0, 500),
        })
        .where(eq(photos.id, job.photo_id));
    } catch (updateError) {
      console.error(`[Queue] Failed to mark photo with retryable error:`, updateError);
    }

    message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
  }
}
```

---

**4. New function: `persistFacesAndUpdatePhoto`**

Location: `apps/api/src/queue/photo-consumer.ts` (same file, keep cohesive)

Responsibilities:

1. Update photo status to 'indexing' (start of processing)
2. Check if event has Rekognition collection (if NULL, create collection)
3. Insert face records into `faces` table (sequential, no transaction)
4. Update photo status to 'indexed' with face_count, clear retryable and error_message
5. Handle zero faces case (no inserts, still mark as indexed)

**Full implementation pattern:**

```typescript
async function persistFacesAndUpdatePhoto(
  db: Database,
  job: PhotoJob,
  data: IndexFacesResult,
  client: RekognitionClient,
): Promise<void> {
  // STEP 1: Mark as 'indexing' (in progress)
  await db.update(photos).set({ status: 'indexing' }).where(eq(photos.id, job.photo_id));

  // STEP 2: Ensure collection exists
  const event = await db
    .select({ collectionId: events.rekognitionCollectionId })
    .from(events)
    .where(eq(events.id, job.event_id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!event.collectionId) {
    try {
      // Create collection
      await createCollection(client, job.event_id);

      // Update event (idempotent)
      await db
        .update(events)
        .set({ rekognitionCollectionId: getCollectionId(job.event_id) })
        .where(eq(events.id, job.event_id));

      console.log(`[Queue] Created collection for event ${job.event_id}`);
    } catch (createError) {
      // Handle AlreadyExistsException (race condition)
      if (createError.name === 'ResourceAlreadyExistsException') {
        console.warn(`[Queue] Collection already exists for event ${job.event_id}, continuing`);
        // Update event record anyway (may be missing from DB)
        await db
          .update(events)
          .set({ rekognitionCollectionId: getCollectionId(job.event_id) })
          .where(eq(events.id, job.event_id));
      } else {
        throw createError; // Other errors should retry
      }
    }
  }

  // STEP 3: Insert faces (if any) - NO TRANSACTION
  if (data.faceRecords.length > 0) {
    const faceRows = data.faceRecords.map((faceRecord) => ({
      photoId: job.photo_id,
      eventId: job.event_id,
      rekognitionFaceId: faceRecord.Face?.FaceId ?? null,
      rekognitionResponse: faceRecord,
      boundingBox: faceRecord.Face?.BoundingBox ?? null,
      confidence: faceRecord.Face?.Confidence ?? 0,
    }));

    await db.insert(faces).values(faceRows);
  }

  // STEP 4: Update photo to 'indexed' (success)
  await db
    .update(photos)
    .set({
      status: 'indexed',
      faceCount: data.faceRecords.length,
      retryable: null, // Clear retryable flag
      errorMessage: null, // Clear error message
    })
    .where(eq(photos.id, job.photo_id));

  // STEP 5: Log unindexed faces (informational)
  if (data.unindexedFaces.length > 0) {
    console.warn(
      `[Queue] ${data.unindexedFaces.length} faces not indexed in photo ${job.photo_id}`,
      { reasons: data.unindexedFaces.map((f) => f.Reasons).flat() },
    );
  }
}
```

**Note on sequential operations (no transactions):**

- Insert faces first
- Then update photo status
- If photo update fails, retry will see status='indexing' and re-insert faces
- Duplicate faces may occur on retry (acceptable for MVP - can add idempotency check later)

---

**5. Error handling updates**

**For retryable errors (existing pattern, add DB updates):**

```typescript
} else if (isRetryableError(error)) {
  console.error(`[Queue] Retryable: ${job.photo_id} - ${errorMessage}`);

  // Mark as retryable error in DB
  try {
    await db
      .update(photos)
      .set({
        retryable: true,
        errorMessage: errorMessage.slice(0, 500),
      })
      .where(eq(photos.id, job.photo_id));
  } catch (dbError) {
    console.error(`[Queue] Failed to mark retryable error:`, dbError);
    // Continue with retry anyway
  }

  message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
}
```

**For throttling errors (similar to retryable):**

```typescript
if (isThrottlingError(error)) {
  console.error(`[Queue] Throttled: ${job.photo_id} - ${errorMessage}`);
  hasThrottleError = true;

  // Mark as retryable error in DB
  try {
    await db
      .update(photos)
      .set({
        retryable: true,
        errorMessage: errorMessage.slice(0, 500),
      })
      .where(eq(photos.id, job.photo_id));
  } catch (dbError) {
    console.error(`[Queue] Failed to mark throttle error:`, dbError);
  }

  message.retry({ delaySeconds: getThrottleBackoffDelay(message.attempts) });
}
```

**For non-retryable errors:**

```typescript
} else if (isNonRetryableError(error)) {
  console.error(`[Queue] Non-retryable: ${job.photo_id} - ${errorMessage}`);

  // Mark photo as failed in DB
  try {
    await db
      .update(photos)
      .set({
        status: 'failed',
        retryable: false,
        errorMessage: errorMessage.slice(0, 500),
      })
      .where(eq(photos.id, job.photo_id));
  } catch (dbError) {
    console.error(`[Queue] Failed to mark photo as failed:`, dbError);
    // Still ack to prevent infinite retries
  }

  message.ack(); // Don't retry
}
```

**For unknown errors (default to retry):**

```typescript
} else {
  console.error(`[Queue] Unknown error: ${job.photo_id} - ${errorMessage}`);

  // Mark as retryable error (safe default)
  try {
    await db
      .update(photos)
      .set({
        retryable: true,
        errorMessage: errorMessage.slice(0, 500),
      })
      .where(eq(photos.id, job.photo_id));
  } catch (dbError) {
    console.error(`[Queue] Failed to mark unknown error:`, dbError);
  }

  message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
}
```

### File Changes Summary

**Files to modify:**

1. `packages/db/src/schema/photos.ts` - Change 'processing' to 'uploading', add 'indexing' status, add retryable field
2. `apps/api/src/routes/photos.ts` - Update T-16 upload endpoint to use 'uploading' status
3. `apps/api/src/queue/photo-consumer.ts` - Add database persistence logic (~150 lines)

**Files to create:**
None (keep everything in photo-consumer.ts for cohesion)

**Files to read for imports:**

- `packages/db/src/schema/events.ts` - events table schema
- `packages/db/src/schema/photos.ts` - photos table schema (will modify)
- `packages/db/src/schema/faces.ts` - faces table schema

## Contracts (only if touched)

### DB

**Photos table (SCHEMA CHANGES):**

- **Changed status value:** `'uploading'` - Replaces 'processing' (T-16 sets this)
- **New status value:** `'indexing'` - Photo is being processed by queue consumer (T-17)
- **New field:** `retryable: boolean | null` - null=success, true=retryable error, false=non-retryable error
- **Existing field:** `error_message: text | null` - Error details (truncated to 500 chars)

**Status transitions:**

- T-16: Sets `status='uploading'` on upload (CHANGED from 'processing')
- T-17 start: Updates to `status='indexing'` before IndexFaces
- T-17 success: Updates to `status='indexed'`, `retryable=null`, `error_message=null`
- T-17 retryable error: Keeps `status='indexing'`, sets `retryable=true`, `error_message='...'`
- T-17 non-retryable error: Updates to `status='failed'`, `retryable=false`, `error_message='...'`

**Events table:**

- Read: `rekognition_collection_id` field
- Write: Set `rekognition_collection_id` to `event-{eventId}` on first photo

**Faces table:**

- Write: Insert rows with:
  - `photo_id` (FK to photos.id)
  - `event_id` (FK to events.id)
  - `rekognition_face_id` (text, nullable)
  - `rekognition_response` (JSONB, full FaceRecord object)
  - `bounding_box` (JSONB, extracted from FaceRecord.Face.BoundingBox)
  - `confidence` (numeric, extracted from FaceRecord.Face.Confidence)

### API

**Rekognition CreateCollection:**

- Input: `CollectionId` (string) = `event-{eventId}`
- Output: `CollectionArn` (string)
- Errors: `ResourceAlreadyExistsException` (handle gracefully)

**Rekognition IndexFaces:**

- Already handled by existing consumer
- Returns: `{ faceRecords: FaceRecord[], unindexedFaces: UnindexedFace[] }`

### Queue

**No changes to queue contract:**

- Message payload: `{ photo_id: string, event_id: string, r2_key: string }`
- Consumer already handles batch processing, rate limiting, ack/retry

## Success path

1. Queue consumer receives batch of PhotoJob messages
2. Rate limiter reserves time slot (existing infrastructure)
3. For each message:
   a. Fetch image from R2 (existing)
   b. Call IndexFaces (existing)
   c. **NEW:** Update photo status to 'indexing'
   d. **NEW:** Check if event has collection ID
   e. **NEW:** If NULL, create collection and update event
   f. **NEW:** Insert face records into `faces` table
   g. **NEW:** Update photo status to 'indexed', face_count, clear retryable/error
   h. Ack message
4. Return from queue handler (no errors thrown)

## Failure modes / edge cases (major only)

### 1. Zero faces detected

**Scenario:** IndexFaces returns empty faceRecords array

**Handling:**

- Update status to 'indexing' first
- Do NOT insert any faces rows
- Update photo: status='indexed', face_count=0, retryable=null, error_message=null
- Ack message (success)
- Log: `[Queue] No faces detected in photo {photo_id}`

### 2. Concurrent first photos (collection race condition)

**Scenario:** Two photos from same event processed simultaneously, both see NULL collection_id

**Handling:**

- Both try to create collection
- One succeeds, other gets `ResourceAlreadyExistsException`
- Catch exception, log warning, update event record (idempotent)
- Both photos continue with IndexFaces
- Both update their own photo status

### 3. Collection created but event update fails

**Scenario:** CreateCollection succeeds, but DB update fails

**Handling:**

- On retry, catch AlreadyExistsException and continue
- Collection ID is deterministic (event_id), so can re-associate later
- Not critical (T-20 cleanup cron handles orphaned collections after 30 days)

### 4. Database timeout during face insert

**Scenario:** Network issue causes face insert to timeout

**Handling:**

- Catch database error in application layer
- Mark photo with retryable=true, error_message
- Retry message with exponential backoff
- On retry, photo status is 'indexing', so will re-insert faces
- Potential duplicate faces if insert partially committed (acceptable for MVP)

### 5. Photo update fails after faces inserted

**Scenario:** Faces inserted successfully, but photo status update fails

**Handling:**

- Database error caught in application layer
- Mark photo with retryable=true, error_message
- Retry message
- On retry, re-insert faces (may create duplicates - acceptable for MVP)
- Eventually succeeds and updates status to 'indexed'

### 6. Non-retryable Rekognition error

**Scenario:** InvalidImageFormatException (should not happen, but defensive)

**Handling:**

- Update photo: status='failed', retryable=false, error_message='InvalidImageFormatException: ...'
- Ack message (don't retry)
- Photo visible to photographer as failed in gallery UI

### 7. Retryable Rekognition error

**Scenario:** ThrottlingException from AWS

**Handling:**

- Keep photo: status='indexing', retryable=true, error_message='ThrottlingException: ...'
- Retry message with longer backoff
- On retry, status still 'indexing', so will re-process
- Eventually succeeds

### 8. Unindexed faces

**Scenario:** Rekognition rejects some faces (low quality, not a face, etc.)

**Handling:**

- Store only successfully indexed faces
- Log warning with rejection reasons
- Photo still marked as 'indexed' (partial success)
- Not a failure mode (expected behavior)

## Validation plan

### Tests to add

**Unit tests** (`apps/api/src/queue/photo-consumer.test.ts`):

1. **Status transition to 'indexing':**
   - Mock: photo starts with status='uploading'
   - Assert: status updated to 'indexing' before IndexFaces called
   - Assert: On success, status updated to 'indexed'

2. **Collection creation on first photo:**
   - Mock: event.rekognition_collection_id = NULL
   - Mock: createCollection succeeds
   - Assert: event updated with collection ID
   - Assert: IndexFaces called with correct collection ID

3. **Collection reuse on subsequent photos:**
   - Mock: event.rekognition_collection_id = 'event-abc'
   - Assert: createCollection NOT called
   - Assert: IndexFaces called with existing collection ID

4. **AlreadyExistsException handling:**
   - Mock: createCollection throws ResourceAlreadyExistsException
   - Assert: Error caught, logged as warning
   - Assert: Event record updated anyway
   - Assert: Processing continues

5. **Zero faces handling:**
   - Mock: IndexFaces returns empty faceRecords array
   - Assert: No faces rows inserted
   - Assert: Photo updated with status='indexed', face_count=0, retryable=null
   - Assert: Message acked

6. **Face persistence:**
   - Mock: IndexFaces returns 3 face records
   - Assert: 3 rows inserted into faces table
   - Assert: Photo updated with status='indexed', face_count=3, retryable=null
   - Assert: Message acked

7. **Unindexed faces logging:**
   - Mock: IndexFaces returns 2 faceRecords, 1 unindexedFace
   - Assert: 2 rows inserted into faces table
   - Assert: Warning logged with rejection reasons
   - Assert: Photo updated with status='indexed', face_count=2

8. **Database error retry:**
   - Mock: Face insert throws connection timeout
   - Assert: Error caught in application layer
   - Assert: Photo updated with retryable=true, error_message set
   - Assert: Message.retry() called with exponential backoff
   - Assert: Photo status remains 'indexing'

9. **Non-retryable error handling:**
   - Mock: IndexFaces throws InvalidImageFormatException
   - Assert: Photo updated with status='failed', retryable=false, error_message set
   - Assert: Message acked (don't retry)

10. **Retryable error handling:**
    - Mock: IndexFaces throws ThrottlingException
    - Assert: Photo updated with retryable=true, error_message set
    - Assert: Status remains 'indexing'
    - Assert: Message.retry() called with throttle backoff

11. **Success clears retryable and error_message:**
    - Setup: Photo has retryable=true, error_message='previous error'
    - Mock: IndexFaces succeeds on retry
    - Assert: Photo updated with retryable=null, error_message=null
    - Assert: Status='indexed'

### Commands to run

```bash
# Generate DB migration (don't run migrate)
pnpm --filter=@sabaipics/db db:generate

# Run queue consumer tests
pnpm --filter=@sabaipics/api test photo-consumer.test.ts

# Run all API tests (ensure no regressions)
pnpm --filter=@sabaipics/api test

# Type check
pnpm --filter=@sabaipics/api typecheck

# Build
pnpm --filter=@sabaipics/api build
```

### Manual testing (required)

**Local development:**

1. Upload photo with 1 face → verify face row created, photo.face_count=1, status='indexed'
2. Upload photo with multiple faces → verify all faces stored, retryable=null
3. Upload photo with no faces (landscape, object) → verify face_count=0, status='indexed'
4. Upload 10 photos to same event rapidly → verify single collection created
5. Check Cloudflare Workers logs for proper [Queue] prefixed logging
6. Verify status transitions: uploading → indexing → indexed

**Staging:**

1. Upload 50 photos simultaneously → verify rate limiting works (no throttling errors)
2. Upload large batch → monitor queue depth, processing time
3. Check database for photos with retryable=true (should be transient)

## Rollout / rollback

### Rollout plan

1. **Prerequisites:**
   - T-16 deployed (photo upload API)
   - **Database migration applied** (new 'indexing' status + retryable field)
   - AWS credentials configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)
   - R2 bucket accessible (PHOTOS_BUCKET binding)
   - Rate limiter DO deployed

2. **Migration:**
   - Run `pnpm --filter=@sabaipics/db db:generate` to create migration
   - User runs `db:push` or `db:migrate` manually
   - Verify migration adds:
     - 'indexing' to status constraint
     - `retryable` column (boolean, nullable)

3. **Deployment:**
   - Deploy queue consumer changes via Wrangler
   - No downtime (queue consumer is async)

4. **Validation:**
   - Monitor queue depth (should process 50 photos/sec)
   - Monitor Cloudflare logs for [Queue] errors
   - Check database: photos.status transitions from 'uploading' → 'indexing' → 'indexed'
   - Check database: faces table populated
   - Check database: retryable field usage (should be mostly null)

### Rollback plan

**If queue consumer has issues:**

1. **Pause queue processing:**
   - Comment out queue handler export in `apps/api/src/index.ts`
   - Re-deploy
   - Photos remain in queue, status='uploading' or 'indexing' (safe)

2. **Revert code:**
   - Revert T-17 PR
   - Restore TODO placeholder
   - Re-deploy

3. **Resume processing:**
   - After fix deployed, photos still in queue will be processed
   - No data loss (R2 images and DB records intact)

**Data cleanup (if needed):**

- Photos stuck in 'indexing' → manually mark as 'failed' or re-enqueue
- Duplicate faces → delete and re-process (soft delete, not critical)
- Orphaned collections → handled by T-20 cleanup cron (30-day retention)

**Migration rollback:**

- If migration needs rollback, manually:
  - Restore 'processing' status value
  - Remove 'uploading' and 'indexing' from status constraint
  - Remove `retryable` column
  - Update T-16 back to use 'processing'
- Note: Existing photos will remain in 'uploading'/'indexing' status (need manual cleanup)

### Monitoring

**Key metrics to track:**

- Queue depth (alert if > 500)
- Processing success rate (target > 95%)
- Face count distribution (0, 1-5, 6-10, 11+)
- Rekognition errors by type (throttling, invalid format, etc.)
- Collection creation count (should be low, one per event)
- **Photos with retryable=true** (should be transient, alert if stuck for > 1 hour)

**Alerts to configure (post-MVP):**

- Rekognition API errors > 10% of requests
- Queue depth > 1000 messages
- DLQ size > 100 (indicates systematic failures)
- Photos stuck in 'indexing' state for > 1 hour

**Queries for monitoring:**

```sql
-- Photos stuck with retryable errors
SELECT * FROM photos
WHERE status = 'indexing'
  AND retryable = true
  AND error_message IS NOT NULL;

-- Photos permanently failed
SELECT * FROM photos
WHERE status = 'failed'
  AND retryable = false;

-- Success rate by event
SELECT event_id,
  COUNT(*) FILTER (WHERE status = 'indexed') as indexed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'indexing') as processing
FROM photos
GROUP BY event_id;
```

## Open questions

### [RESOLVED] Collection naming convention

**Decision:** Use `event-{eventId}` as collection ID (matches getCollectionId helper)
**Evidence:** Existing `getCollectionId` function in `rekognition/client.ts` already uses this format

### [RESOLVED] Collection idempotency handling

**Decision:** Catch `ResourceAlreadyExistsException` and continue (option B from risk scout)
**Rationale:** Simpler than checking existence first, idempotent, handles race conditions

### [RESOLVED] Zero faces handling

**Decision:** Success state (status='indexed', face_count=0, retryable=null)
**Evidence:** Acceptance criteria explicitly states "Handle no-faces case (face_count=0, still indexed)"

### [RESOLVED] Retry strategy

**Decision:** Use existing exponential backoff pattern (2, 4, 8, ... 300s max)
**Evidence:** Already implemented in `getBackoffDelay` function

### [RESOLVED] DLQ handling

**Decision:** Mark photo as 'failed' with retryable=false when non-retryable error occurs
**Rationale:** Makes failed photos visible to photographer in gallery UI, enables support workflow
**Note:** DLQ consumer to mark retried-out photos as 'failed' is out of scope for T-17 (can be separate task)

### [RESOLVED] Rate limiter DO

**Decision:** Use existing implementation
**Evidence:** Confirmed in codebase-exemplars.md - rate limiter DO already deployed at `apps/api/src/durable-objects/rate-limiter.ts`

### [RESOLVED] R2 fetch mechanism

**Decision:** Use R2 binding (env.PHOTOS_BUCKET)
**Evidence:** Confirmed in tech-docs.md and existing queue consumer code

### [RESOLVED] Transaction usage

**Decision:** Do NOT use transactions (Neon driver limitation)
**Impact:** Sequential operations instead (insert faces, then update photo)
**Risk:** Duplicate faces on retry if photo update fails (acceptable for MVP)
**Evidence:** User feedback COMMENT-1

### [RESOLVED] Status flow

**Decision:** Change T-16 to 'uploading', add 'indexing' status for T-17
**Flow:** 'uploading' (T-16) → 'indexing' (T-17 start) → 'indexed' (success) or 'failed' (non-retryable)
**Evidence:** User feedback COMMENT-2 + final confirmation

### [RESOLVED] Retryable field

**Decision:** Add `retryable: boolean | null` field, default null
**Logic:** null=success, true=retryable error, false=non-retryable error
**Evidence:** User feedback COMMENT-2

### [NOTED - not blocking] PDPA compliance for biometric data

**Question:** Does PDPA consent cover storing full Rekognition response (face landmarks, attributes)?
**Impact:** May need legal review, but not blocking for implementation
**Recommendation:** Store full response (as designed), flag for legal review before production launch
**Note:** Face data is already scoped to event lifecycle (30-day retention via T-20)
