# Logs Scout

Task: T-20 — Rekognition cleanup cron job
Root: BS_0001_S-1
Date: 2026-01-13

## Relevant prior implementations

### T-1 — Database Schema (iter-001, iter-002)
Path: `docs/logs/BS_0001_S-1/implementation/T-1/summary/iter-001.md`, `iter-002.md`

Key patterns:
- **UUID type**: All IDs use native `uuid` type (not `text`)
- **FK cascade**: All foreign keys use `RESTRICT` (not CASCADE) - soft delete preferred over hard delete
- **Timestamp convention**: Use `timestamptz(name)` helper from `common.ts`
- **Index naming**: `{table}_{column}_idx` pattern
- **Schema location**: `packages/db/src/schema/`
- **Migration generation**: `pnpm --filter=@sabaipics/db db:generate`

Database schema for T-20:
```typescript
// events table (packages/db/src/schema/events.ts)
{
  id: uuid,
  photographerId: uuid,
  rekognitionCollectionId: text | null, // Set when first photo uploaded
  createdAt: timestamptz,
  expiresAt: timestamptz, // 30 days from creation
}

// photos table (packages/db/src/schema/photos.ts)
{
  id: uuid,
  eventId: uuid,
  deletedAt: timestamptz | null, // Soft delete timestamp
  status: 'uploading' | 'indexing' | 'indexed' | 'failed',
}
```

### T-2 — requirePhotographer Middleware
Path: `docs/logs/BS_0001_S-1/implementation/T-2/summary/iter-001.md`

Key patterns:
- **DB access**: Use `getDb(c)` helper from `apps/api/src/lib/db.ts`
- **Error responses**: Use helper functions for 401/403/404 (check `apps/api/src/lib/error.ts`)
- **Type safety**: Extend Hono context with typed variables

Not applicable to T-20 (cron doesn't use auth middleware).

### T-5 — PDPA Consent API
Path: `docs/logs/BS_0001_S-1/implementation/T-5/summary/iter-001.md`

Key patterns:
- **Idempotency**: Check existing state before insert (409 if already exists)
- **IP capture**: Use `c.req.header('CF-Connecting-IP')` for audit logs
- **Logging**: Use `console.log` for operational events

Relevant for T-20:
- Idempotency pattern: check before delete (don't fail if already deleted)
- Logging pattern: structured logs with context

### T-10 — Stripe Webhook Handler
Path: `docs/logs/BS_0001_S-1/implementation/T-10/summary/iter-001.md`

Key patterns:
- **Webhook handler structure**: Validate → Process → Log → Return 200
- **Error handling**: Log errors but return 200 (no retry for validation errors)
- **Idempotency**: Use unique constraints to prevent duplicate processing
- **Post-action failures**: Log with context, no rollback

Relevant for T-20:
- Cron handler structure similar to webhook (scheduled trigger instead of HTTP)
- Error handling: log and continue for partial failures
- Return success even if some deletions fail

### T-13 — Events API (CRUD + QR)
Path: `docs/logs/BS_0001_S-1/implementation/T-13/summary/iter-001.md`

Key patterns:
- **Access code generation**: Use `nanoid` with retry logic (max 5 attempts)
- **QR code generation**: Use `generateEventQR()` from `apps/api/src/lib/qr/`
- **R2 upload**: `env.PHOTOS_BUCKET.put(key, data, { httpMetadata })`
- **Event expiry**: Set to 30 days from creation

Relevant for T-20:
- **Expiry calculation**: `expiresAt` is 30 days from `createdAt`
- **Collection ID pattern**: `rekognitionCollectionId` is set to `eventId` (UUID)

### T-16 — Photo Upload API (iter-001, iter-002)
Path: `docs/logs/BS_0001_S-1/implementation/T-16/summary/iter-001.md`, `iter-002.md`

Key patterns:
- **Transaction pattern**: Use Drizzle transactions for multi-step DB operations
- **Post-deduction failures**: Log with context (photographerId, photoId, eventId)
- **No refunds**: Credit deducted even if post-processing fails
- **R2 operations**: `env.PHOTOS_BUCKET.put()` and `.delete()`
- **Error logging**:
  ```typescript
  console.error('[Photo Upload] R2 upload failed', {
    photographerId,
    photoId,
    eventId,
    creditsDeducted: 1,
    error: err.message,
  });
  ```

Relevant for T-20:
- **Bulk operations**: Process multiple items with partial failure handling
- **Logging pattern**: Structured logs with all relevant IDs
- **No rollback**: Continue processing even if individual items fail

### T-17 — Photo Queue Consumer (Rekognition Indexing)
Path: References in logs (no summary found, task not yet complete)

Patterns from logs:
- **Collection creation**: First photo in event creates Rekognition collection
- **Collection naming**: Collection ID = `eventId` (UUID)
- **Rekognition client**: Use `createRekognitionClient(env)` from `apps/api/src/lib/rekognition/`
- **Error classification**: Map AWS errors to retryable/non-retryable

From T-17 plan references:
- **Cleanup responsibility**: T-20 handles orphaned collections after 30 days
- **Collection lifecycle**: Created on first upload, deleted by T-20 after expiry

### T-19 — Bulk Photo Operations
Path: References in `apps/api/src/routes/photos.ts`

**Bulk Soft Delete Implementation Found:**
```typescript
// POST /events/:eventId/photos/delete
// File: apps/api/src/routes/photos.ts:695-745

const bulkDeleteSchema = z.object({
  photoIds: z.array(z.string().uuid()).min(1).max(50, 'Maximum 50 photos per delete'),
});

// Soft delete photos (only non-deleted photos belonging to this event)
const result = await db
  .update(photos)
  .set({ deletedAt: new Date().toISOString() })
  .where(and(
    eq(photos.eventId, eventId),
    inArray(photos.id, photoIds),
    isNull(photos.deletedAt),
  ))
  .returning({ id: photos.id });

console.log(`[Bulk Delete] Soft deleted photos`, {
  requested: photoIds.length,
  deleted: result.length,
});
```

Key patterns:
- **Soft delete**: Set `deletedAt` timestamp (don't use SQL DELETE)
- **Idempotency**: Only update photos where `deletedAt IS NULL`
- **Batch limit**: Max 50 items per request
- **Result tracking**: Return count of affected rows
- **Logging**: Log requested vs actual deleted count

**Query patterns with soft delete:**
```typescript
// List photos (exclude deleted)
.where(and(
  eq(photos.eventId, eventId),
  isNull(photos.deletedAt), // Filter out soft-deleted
  // ... other conditions
))
```

## Carry-forward constraints

### Database Patterns

**Query Construction:**
- Use Drizzle ORM query builder (not raw SQL)
- Use `eq()`, `and()`, `isNull()`, `isNotNull()`, `lt()` from `drizzle-orm`
- Always use prepared statements (Drizzle handles this)

**Events Query for Cleanup:**
```typescript
import { db } from '@sabaipics/db';
import { events } from '@sabaipics/db/schema';
import { lt, isNotNull, sql } from 'drizzle-orm';

// Find expired events with Rekognition collections
const expiredEvents = await db
  .select({
    id: events.id,
    rekognitionCollectionId: events.rekognitionCollectionId,
  })
  .from(events)
  .where(and(
    lt(events.createdAt, sql`NOW() - INTERVAL '30 days'`),
    isNotNull(events.rekognitionCollectionId),
  ));
```

**Update Pattern:**
```typescript
// Update event to clear collection ID
await db
  .update(events)
  .set({ rekognitionCollectionId: null })
  .where(eq(events.id, eventId));
```

### Error Handling

**Partial Failure Pattern (from T-10, T-16):**
```typescript
// Process each item independently
for (const event of expiredEvents) {
  try {
    await deleteCollection(client, event.id);
    await db.update(events)
      .set({ rekognitionCollectionId: null })
      .where(eq(events.id, event.id));

    console.log('[Cleanup] Deleted collection', {
      eventId: event.id,
      collectionId: event.rekognitionCollectionId,
    });
  } catch (err) {
    console.error('[Cleanup] Failed to delete collection', {
      eventId: event.id,
      collectionId: event.rekognitionCollectionId,
      error: err.message,
    });
    // Continue to next event (don't throw)
  }
}
```

**AWS Error Handling (from T-17 context):**
- `ResourceNotFoundException`: Collection already deleted → continue (idempotent)
- `ThrottlingException`: Retryable → log and continue (cron will retry tomorrow)
- Other errors → log and continue

### Logging Patterns

**Structured Logging Convention:**
```typescript
// Success log
console.log('[Cleanup] Job started', {
  timestamp: new Date().toISOString(),
  eventsToProcess: expiredEvents.length,
});

// Item success
console.log('[Cleanup] Deleted collection', {
  eventId: string,
  collectionId: string,
});

// Item failure
console.error('[Cleanup] Failed to delete collection', {
  eventId: string,
  collectionId: string,
  error: string,
  awsErrorName: string, // if available
});

// Job summary
console.log('[Cleanup] Job completed', {
  totalProcessed: number,
  successCount: number,
  failureCount: number,
  duration: number, // milliseconds
});
```

### Testing Conventions

**Unit Test Pattern (from T-5, T-10, T-13):**
- Use Vitest as test runner
- Mock external services (AWS SDK, R2)
- Test file location: `apps/api/src/scheduled/cleanup.test.ts`
- Test structure:
  ```typescript
  describe('Rekognition Cleanup Cron', () => {
    it('deletes collections for expired events', async () => { /* ... */ });
    it('skips events without collection ID', async () => { /* ... */ });
    it('handles ResourceNotFoundException gracefully', async () => { /* ... */ });
    it('continues processing after partial failure', async () => { /* ... */ });
  });
  ```

**Note from T-16:** Unit tests may have limitations with Hono testClient. For cron jobs, direct function testing is preferred.

## Soft-delete patterns

**Implementation Status:**
- ✅ **Photos table**: `deletedAt` column exists with index
- ✅ **Bulk delete API**: POST `/events/:eventId/photos/delete` implemented
- ❌ **Events table**: No `deletedAt` column (not needed for T-20)
- ❌ **Faces table**: No `deletedAt` column (cascade from photos via query filter)

**Pattern from T-19:**
```typescript
// Soft delete: set timestamp
.set({ deletedAt: new Date().toISOString() })

// Query: exclude deleted
.where(isNull(photos.deletedAt))
```

**NOT applicable to T-20:**
- T-20 only clears `rekognitionCollectionId` field (no soft delete of events)
- Rekognition collection deletion is HARD delete (AWS API call)
- Event records remain in DB (only collection ID cleared)

## Rekognition patterns

**Client Creation (from T-17 context):**
```typescript
import { createRekognitionClient, deleteCollection } from './lib/rekognition';

const client = createRekognitionClient({
  AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: env.AWS_REGION,
});
```

**Collection Operations:**
```typescript
// File: apps/api/src/lib/rekognition/client.ts

// Create collection (T-17)
export async function createCollection(
  client: RekognitionClient,
  eventId: string,
): Promise<string>

// Delete collection (T-20 will use this)
export async function deleteCollection(
  client: RekognitionClient,
  eventId: string
): Promise<void> {
  const collectionId = getCollectionId(eventId); // returns eventId
  const command = new DeleteCollectionCommand({ CollectionId: collectionId });
  await client.send(command);
}

// Helper: Collection ID = Event ID
function getCollectionId(eventId: string): string {
  return eventId; // No prefix, just the UUID
}
```

**Error Handling (from T-17 context):**
```typescript
// Retryable errors (from client.ts:59-65)
const RETRYABLE_AWS_ERRORS = new Set([
  'ThrottlingException',
  'ProvisionedThroughputExceededException',
  'ServiceUnavailableException',
  'InternalServerError',
  'LimitExceededException',
]);

// Idempotent error (safe to ignore)
// ResourceNotFoundException → collection already deleted
```

**Collection Lifecycle (from T-17 plan references):**
1. Event created (T-13) → `rekognitionCollectionId = NULL`
2. First photo uploaded (T-17) → Creates collection, sets `rekognitionCollectionId = eventId`
3. More photos uploaded → Indexed into same collection
4. 30 days after event creation → T-20 deletes collection, sets `rekognitionCollectionId = NULL`
5. Photos remain in DB (gallery still works, selfie search disabled)

**Key Design Decision (from plan v4.md:372):**
- QR codes (R2): 30-day lifecycle rule
- Rekognition collections: 30-day cron job cleanup
- Photos and faces (DB): Forever (kept for training)

## Worker/Job/Cron Patterns

**Cloudflare Scheduled Event Handler:**
```typescript
// File: apps/api/src/index.ts (scheduled export)
export default {
  async fetch(request, env, ctx) { /* HTTP handler */ },
  async scheduled(event, env, ctx) { /* Cron handler */ }
}
```

**Cron Trigger Configuration:**
```jsonc
// File: wrangler.jsonc
{
  "triggers": {
    "crons": ["0 2 * * *"] // 2 AM daily
  }
}
```

**No existing cron examples in codebase**, but pattern from Cloudflare docs:
```typescript
async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  ctx.waitUntil(runCleanup(env));
}

async function runCleanup(env: Env) {
  // Implementation here
}
```

## Validation Commands

**Build/Type Check:**
```bash
pnpm --filter=@sabaipics/api build
pnpm check-types
```

**Run Tests:**
```bash
pnpm --filter=@sabaipics/api test
```

**Generate Migration (if schema changes):**
```bash
pnpm --filter=@sabaipics/db db:generate
```

**Manual Cron Trigger (for testing):**
```bash
# Local testing with wrangler
wrangler dev
# Then trigger scheduled event via Wrangler UI or curl
```

## Key Findings Summary

1. **Soft Delete Found**: T-19 implements bulk photo soft delete with `deletedAt` timestamp
2. **No Event Soft Delete**: Events don't have `deletedAt` (not needed for T-20)
3. **Rekognition Client Ready**: `deleteCollection()` function already exists in `lib/rekognition/client.ts`
4. **Collection ID Convention**: Collection ID = Event ID (UUID, no prefix)
5. **Error Handling Pattern**: Log and continue for partial failures (from T-10, T-16)
6. **Logging Convention**: Structured logs with `[Cleanup]` prefix and context objects
7. **No Existing Crons**: T-20 is first scheduled task in codebase
8. **Expiry Logic**: Events expire 30 days after `createdAt` (not `expiresAt` timestamp!)
9. **Idempotency Critical**: Handle `ResourceNotFoundException` gracefully (collection already deleted)
10. **No Rollback**: Clear `rekognitionCollectionId` even if deletion fails (will retry tomorrow)

## Gaps/Uncertainties for Plan

1. **Cron schedule**: Daily at 2 AM? Or different time? (Default: 2 AM UTC)
2. **Batch size**: Process all expired events or limit per run? (Default: all)
3. **Monitoring**: Cloudflare Analytics only or external monitoring? (Default: console logs only)
4. **Test strategy**: Unit tests or manual testing? (Default: unit tests + manual trigger)
5. **Staging rollout**: Test cron in staging first? (Default: yes, test with wrangler)
