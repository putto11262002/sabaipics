# Codebase Exemplars

Task: T-20 — Rekognition cleanup cron job
Root: BS_0001_S-1
Date: 2026-01-13

## Exemplar 1: Soft-delete pattern

**File:** `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/routes/photos.ts`
**Lines:** 694-751
**Why relevant:** Shows how to bulk mark photos as deleted using `deletedAt` field

**Key patterns to follow:**
- Uses `deletedAt` field with timestamp for soft deletes (line 731)
- Bulk operations use `inArray()` for multiple IDs (line 734)
- Combines conditions with `and()` for safety (eventId + photoIds + isNull) (lines 732-736)
- Returns count of affected rows via `.returning()` (line 737)
- Logs before/after counts for audit trail (lines 710, 739-742)

```typescript
// Soft delete photos (only non-deleted photos belonging to this event)
const result = await db
  .update(photos)
  .set({ deletedAt: new Date().toISOString() })
  .where(and(
    eq(photos.eventId, eventId),
    inArray(photos.id, photoIds),
    isNull(photos.deletedAt),  // Only delete non-deleted photos
  ))
  .returning({ id: photos.id });

console.log(`[Bulk Delete] Soft deleted photos`, {
  requested: photoIds.length,
  deleted: result.length,
});
```

**T-20 adaptation:**
- For T-20: Query for events with `created_at < NOW() - 30 days AND rekognition_collection_id IS NOT NULL`
- After deleting Rekognition collection, set `rekognition_collection_id = NULL` (similar to soft delete)
- Also soft-delete photos: set `deletedAt = NOW()` for all photos in the event

---

## Exemplar 2: Rekognition deletion pattern

**File:** `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/lib/rekognition/client.ts`
**Lines:** 163-178
**Why relevant:** Shows how to delete Rekognition collections

**Key patterns to follow:**
- Uses `DeleteCollectionCommand` with collection ID (lines 173-175)
- Collection ID is deterministic: uses `getCollectionId(eventId)` helper (line 171)
- Simple async/await pattern, no explicit error handling (errors bubble up)
- Client is passed in as parameter (created once, reused)

```typescript
/**
 * Delete a Rekognition collection.
 * Called when event expires or is deleted.
 */
export async function deleteCollection(client: RekognitionClient, eventId: string): Promise<void> {
  const collectionId = getCollectionId(eventId);

  const command = new DeleteCollectionCommand({
    CollectionId: collectionId,
  });

  await client.send(command);
}
```

**Helper function (line 265):**
```typescript
export function getCollectionId(eventId: string): string {
  return eventId;  // Collection ID = event UUID directly
}
```

**T-20 adaptation:**
- Create Rekognition client once at cron start
- For each expired event, call `deleteCollection(client, event.id)`
- Handle errors per-collection (don't fail entire batch if one fails)

---

## Exemplar 3: Batch processing with error handling

**File:** `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/queue/photo-consumer.ts`
**Lines:** 426-593
**Why relevant:** Shows how to process batches with per-item error handling and logging

**Key patterns to follow:**
- Process items in batch (line 475-485)
- Handle each item individually in try-catch (lines 499-519, 520-586)
- Log success/failure for each item (lines 500, 503-504, 525-531)
- Continue processing remaining items even if one fails
- Comprehensive logging with structured data (photoId, eventId, etc.)

**Error handling pattern:**
```typescript
for (const { message, result } of processed) {
  const job = message.body;

  if (result.isOk()) {
    // Success path
    try {
      await persistFacesAndUpdatePhoto(db, job, result.value, client);
      message.ack();
    } catch (dbError) {
      console.error(`[Queue] Database error for ${job.photo_id}:`, dbError);
      // Mark as retryable, continue processing
      message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
    }
  } else {
    // Error path
    console.error(`[Queue] Processing failed`, {
      photoId: job.photo_id,
      errorName: error.name,
      errorMessage,
    });
    // Handle based on error type...
  }
}
```

**T-20 adaptation:**
- Fetch batch of expired events
- For each event:
  1. Try to delete Rekognition collection
  2. Log success/failure
  3. On success: update DB (set collection_id = NULL, soft-delete photos)
  4. On failure: log error but continue to next event
- Return summary: { processed: N, succeeded: M, failed: K }

---

## Exemplar 4: Database persistence with sequential operations

**File:** `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/queue/photo-consumer.ts`
**Lines:** 111-218
**Why relevant:** Shows pattern for multi-step DB operations without transactions

**Key patterns to follow:**
- Sequential updates: status → data → final status (lines 124, 188, 192-201)
- Check-then-create pattern with idempotency (lines 127-172)
- Handle race conditions gracefully (AlreadyExistsException, lines 155-168)
- Detailed logging at each step (lines 117-121, 135-138, 150-154, 176-179, 203-206)
- Clear error messages with context (photoId, eventId)

```typescript
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
  // Create collection...
}

// STEP 3: Insert faces (if any)
if (data.faceRecords.length > 0) {
  await db.insert(faces).values(faceRows);
}

// STEP 4: Update photo to 'indexed' (success)
await db.update(photos).set({
  status: 'indexed',
  faceCount: data.faceRecords.length,
  retryable: null,
  errorName: null,
}).where(eq(photos.id, job.photo_id));
```

**T-20 adaptation:**
- Step 1: Delete Rekognition collection
- Step 2: Soft-delete all photos for the event
- Step 3: Update event: set `rekognition_collection_id = NULL`
- Each step in try-catch with specific error handling

---

## Database query patterns

### Batch querying events with conditions

**File:** `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/packages/db/src/schema/events.ts`
**Schema reference (lines 6-28):**

```typescript
export const events = pgTable("events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  photographerId: uuid("photographer_id").notNull().references(() => photographers.id),
  name: text("name").notNull(),
  rekognitionCollectionId: text("rekognition_collection_id"), // Nullable
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: createdAtCol(),
});
```

**T-20 query pattern:**
```typescript
// Find events older than 30 days with Rekognition collections
const expiredEvents = await db
  .select({
    id: events.id,
    name: events.name,
    collectionId: events.rekognitionCollectionId,
    createdAt: events.createdAt,
  })
  .from(events)
  .where(
    and(
      lt(events.createdAt, sql`NOW() - INTERVAL '30 days'`),
      isNotNull(events.rekognitionCollectionId)
    )
  )
  .limit(100); // Process in batches
```

### Bulk photo soft-delete by event

**Pattern from bulk delete (lines 729-737):**
```typescript
const result = await db
  .update(photos)
  .set({ deletedAt: new Date().toISOString() })
  .where(
    and(
      eq(photos.eventId, eventId),
      isNull(photos.deletedAt)  // Only update non-deleted photos
    )
  )
  .returning({ id: photos.id });
```

---

## Error handling patterns

### AWS SDK error handling (Rekognition)

**File:** `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/lib/rekognition/client.ts`
**Lines:** 50-95

**Error classification:**
```typescript
const RETRYABLE_AWS_ERRORS = new Set([
  'ThrottlingException',
  'ProvisionedThroughputExceededException',
  'ServiceUnavailableException',
  'InternalServerError',
  'LimitExceededException',
]);

const THROTTLE_AWS_ERRORS = new Set([
  'ThrottlingException',
  'ProvisionedThroughputExceededException',
  'LimitExceededException',
]);

function mapAwsError(awsError: unknown): RekognitionError {
  const e = awsError as { name?: string; message?: string };
  const errorName = e.name ?? 'UnknownError';
  const retryable = RETRYABLE_AWS_ERRORS.has(errorName);

  return new RekognitionError(e.message ?? 'AWS error occurred', {
    name: errorName,
    retryable,
    cause: awsError,
  });
}
```

**T-20 error handling:**
- `ResourceNotFoundException`: Collection already deleted (expected, not an error)
- Retryable errors: Skip for now, log, continue to next event
- Non-retryable errors: Log, mark event as problematic, continue

### Per-item error handling with continuation

**Pattern from photo consumer (lines 494-586):**
```typescript
for (const item of batch) {
  try {
    // Process item...
    await processItem(item);
    successCount++;
  } catch (error) {
    console.error(`[Cron] Failed to process item`, {
      itemId: item.id,
      error: error instanceof Error ? error.message : String(error),
    });
    failureCount++;
    // Continue to next item (don't throw)
  }
}

console.log(`[Cron] Batch complete`, {
  total: batch.length,
  succeeded: successCount,
  failed: failureCount,
});
```

---

## Test patterns

### Unit test structure

**File:** `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/routes/photos.test.ts`
**Pattern:**
- Uses Vitest framework
- Mock Cloudflare bindings (env)
- Mock database responses
- Test happy path + error cases

**T-20 test cases:**
1. No expired events → returns { processed: 0, succeeded: 0, failed: 0 }
2. One expired event → deletes collection, updates DB, soft-deletes photos
3. Multiple expired events → processes all, returns summary
4. Collection already deleted (ResourceNotFoundException) → treats as success
5. Database error → logs error, continues to next event
6. Partial failures → some succeed, some fail, returns accurate counts

---

## Critical code to read before implementing

### Core files
1. `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/lib/rekognition/client.ts`
   - Lines 163-178: `deleteCollection()` implementation
   - Lines 265-267: `getCollectionId()` helper
   - Lines 82-95: Error mapping pattern

2. `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/routes/photos.ts`
   - Lines 694-751: Bulk soft-delete implementation
   - Lines 180-188: Query with `isNull(photos.deletedAt)`

3. `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/queue/photo-consumer.ts`
   - Lines 426-593: Batch processing with error handling
   - Lines 111-218: Multi-step DB operations pattern

### Schema files
4. `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/packages/db/src/schema/events.ts`
   - Events schema with `rekognition_collection_id` and `created_at`

5. `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/packages/db/src/schema/photos.ts`
   - Photos schema with `deletedAt` field

### Infrastructure
6. `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/wrangler.jsonc`
   - Lines 1-190: Worker configuration (no cron triggers yet - need to add)

---

## Cron structure (NOT_FOUND - need to create)

**Expected location:** `apps/api/src/crons/`

**Pattern to follow (inferred from queue consumer):**
```typescript
// apps/api/src/crons/rekognition-cleanup.ts
export async function scheduledRekognitionCleanup(
  event: ScheduledEvent,
  env: Bindings,
  ctx: ExecutionContext
): Promise<void> {
  console.log(`[Cron] Starting Rekognition cleanup`, {
    scheduledTime: event.scheduledTime,
    cron: event.cron,
  });

  // Create clients
  const db = createDb(env.DATABASE_URL);
  const rekognitionClient = createRekognitionClient({
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: env.AWS_REGION,
  });

  // Query expired events...
  // Process batch...
  // Return summary...
}
```

**Wrangler configuration to add:**
```json
{
  "triggers": {
    "crons": ["0 2 * * *"]  // Daily at 2am UTC
  }
}
```

**Index.ts export:**
```typescript
// apps/api/src/index.ts
export { scheduledRekognitionCleanup as scheduled } from './crons/rekognition-cleanup';
```

---

## Additional notes

### Cloudflare Workers Cron Triggers documentation
- Cron triggers use standard cron syntax
- Handler signature: `async function scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext)`
- Event object includes: `scheduledTime`, `cron`
- Use `ctx.waitUntil()` for background tasks that should complete

### T-17 patterns directly relevant to T-20
- T-17 shows how to create/delete collections
- T-17 shows multi-step DB operations without transactions
- T-17 shows comprehensive logging strategy
- T-17 handles partial failures gracefully

### Important: No existing cron infrastructure
- No `src/crons/` directory exists yet
- No cron triggers in wrangler.jsonc
- No example cron handlers in codebase
- T-20 will be first cron job - need to create patterns from scratch based on queue consumer patterns

### Photo soft-delete considerations
- Soft-delete is safer than hard-delete (can be recovered)
- Query pattern: `WHERE deletedAt IS NULL` to exclude deleted photos
- All photo queries already use this pattern (line 182, 261)
- Batch soft-delete by event: `UPDATE photos SET deletedAt = NOW() WHERE event_id = ? AND deletedAt IS NULL`
