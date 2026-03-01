# Upstream Dossier

Task: T-20 — Rekognition cleanup cron job
Root: BS_0001_S-1
Date: 2026-01-13

## Task definition

**Type:** hardening
**StoryRefs:** None (ops)
**Goal:** Create cron job to delete Rekognition collections for events older than 30 days.
**PrimarySurface:** Jobs
**Scope:** `apps/api/src/cron/`, `apps/api/wrangler.jsonc`
**Dependencies:** T-1 (DB Schema), T-17 (Photo queue consumer with Rekognition indexing)

**Acceptance Criteria:**

- Runs daily via Cloudflare Cron Trigger
- Finds events where `created_at < NOW - 30 days` AND `rekognition_collection_id IS NOT NULL`
- Calls Rekognition DeleteCollection for each collection
- Updates event: `rekognition_collection_id = NULL`
- Logs deletions for audit trail
- Handles partial failures gracefully (one collection failure doesn't break the entire job)

**Tests:**

- Unit test with mock Rekognition client
- Test idempotency (already deleted collections)

**Rollout/Risk:**

- Medium risk (data deletion operation)
- Run manually first to verify correct events are selected
- Keep audit logs for compliance and debugging

## Upstream plan context

### Why this task exists

This is part of the **Data Retention & Cleanup** strategy defined in Phase 0 of the execution plan. The system has a 30-day retention policy for Rekognition collections to manage costs while preserving training data.

**From final.md - Data Retention Strategy (lines 366-382):**

- **Events (DB):** Forever
- **Photos (R2):** Forever (for model training)
- **Photos (DB):** Forever (including face metadata)
- **Faces (DB):** Forever (full Rekognition response stored as JSONB)
- **QR codes (R2):** 30 days (R2 lifecycle rule, not useful for training)
- **Rekognition collections:** **30 days after event created** (cron job → DeleteCollection)

**Rationale:**

- Keep photos and face data for model training (stored in DB as JSONB in `faces.rekognition_response`)
- Delete Rekognition collections (expensive to maintain, ~$1/month per collection)
- After 30 days: gallery still works, face counts visible, but selfie search disabled (acceptable tradeoff)

### Relationship to overall execution

This task is in the **Cleanup phase**, separate from the main feature implementation phases (Auth, Dashboard, Events, Upload). It's a hardening task that ensures operational cost control without impacting core user functionality.

The task was mentioned in Phase 0 (Foundation) as item 0.7: "Job to delete Rekognition collections 30 days after event created" but scheduled after all core features are complete to avoid premature optimization.

## Linked decisions/research

### Decision 14: Data Retention Policy

**From decisions-input.md & final.md Decision Table (line 36):**

- Decision: "Keep forever (photos, DB); delete Rekognition collection after 30 days"
- This establishes the 30-day threshold for collection cleanup

### Research: HEIC Support & Rekognition Integration

**From research/heic-rekognition.md:**

- Confirms that Rekognition collections are created lazily (on first photo upload for an event)
- Collection ID is stored in `events.rekognition_collection_id` (nullable)
- Collection ID format: uses event UUID directly (per `getCollectionId()` helper)
- Delete operation uses AWS SDK `DeleteCollectionCommand`

**Key implementation detail (from client.ts lines 164-178):**

```typescript
export async function deleteCollection(client: RekognitionClient, eventId: string): Promise<void> {
  const collectionId = getCollectionId(eventId);
  const command = new DeleteCollectionCommand({ CollectionId: collectionId });
  await client.send(command);
}
```

This helper already exists and is ready to use. The helper uses `getCollectionId(eventId)` which returns the event UUID directly (line 265-267).

### Cloudflare Workers Cron Triggers

**From wrangler.jsonc inspection:**

- No existing cron triggers are configured
- Cron triggers are defined at the top level or per-environment in `wrangler.jsonc`
- Format: `"triggers": { "crons": ["0 0 * * *"] }` for daily at midnight UTC
- Handler registered in main Worker export as `scheduled(event, env, ctx)`

**Cloudflare Cron Trigger documentation:**

- Supports standard cron syntax
- Maximum frequency: once per minute (but once per day is sufficient for this task)
- Execution is best-effort (not guaranteed, but highly reliable)
- No cost for cron triggers themselves, only for Worker execution time

## Key dependencies (resolved)

### T-1: Database Schema (COMPLETED)

**Delivered:**

- `events` table with `rekognition_collection_id` column (nullable text)
- `created_at` column for age calculation
- Schema file: `packages/db/src/schema/events.ts`

**Key schema details:**

```typescript
rekognitionCollectionId: text("rekognition_collection_id"), // Nullable, created on first upload
expiresAt: timestamptz("expires_at").notNull(),
createdAt: createdAtCol(),
```

**Relevance to T-20:**

- Query must filter on `rekognition_collection_id IS NOT NULL` (only events with collections)
- Use `created_at` for 30-day threshold calculation
- Update `rekognition_collection_id = NULL` after successful deletion

### T-17: Photo Queue Consumer (Rekognition Indexing) (COMPLETED)

**Delivered:**

- Rekognition client wrapper with collection management functions
- `createCollection()` - creates collection on first photo upload
- `deleteCollection()` - already implemented but unused (lines 164-178 in client.ts)
- `getCollectionId()` helper - converts eventId to collectionId (just returns UUID as-is)
- Error handling with `RekognitionError` class and AWS error mapping

**Key integration points:**

```typescript
// From apps/api/src/lib/rekognition/client.ts
export async function deleteCollection(client: RekognitionClient, eventId: string): Promise<void>;
export function createRekognitionClient(env: RekognitionEnv): RekognitionClient;
export function getCollectionId(eventId: string): string;
```

**Error handling:**

- `ResourceNotFoundException` - collection already deleted (idempotent, safe to ignore)
- `ThrottlingException` - need backoff/retry logic
- `InternalServerError` - retryable

**Relevance to T-20:**

- Reuse existing `deleteCollection()` function (no need to reimplement)
- Reuse existing `createRekognitionClient()` for authentication
- Reuse existing error handling patterns from photo-consumer.ts
- Handle `ResourceNotFoundException` gracefully (idempotency)

## Implementation notes

### Database query pattern

```typescript
// Find events eligible for cleanup
const eligibleEvents = await db
  .select({ id: events.id, collectionId: events.rekognitionCollectionId })
  .from(events)
  .where(
    and(
      isNotNull(events.rekognitionCollectionId),
      lt(events.createdAt, sql`NOW() - INTERVAL '30 days'`),
    ),
  );
```

### Cloudflare Worker scheduled handler pattern

```typescript
// apps/api/src/index.ts (add alongside fetch and queue handlers)
export default {
  async fetch(request, env, ctx) {
    /* existing */
  },
  async queue(batch, env, ctx) {
    /* existing */
  },
  async scheduled(event, env, ctx) {
    // Cron job handler - calls cleanup logic
  },
};
```

### Error handling strategy

1. Log all deletions (success and failure) for audit
2. Continue processing remaining collections if one fails (don't throw)
3. Ignore `ResourceNotFoundException` (already deleted, idempotent)
4. Log errors but don't retry (will run again tomorrow)
5. Use `ctx.waitUntil()` for async logging if needed

### Manual testing checklist (before deploy)

1. Seed test event with `created_at` > 30 days ago
2. Manually create Rekognition collection for test event
3. Run cron handler manually via Wrangler CLI: `wrangler dev --test-scheduled`
4. Verify collection deleted in AWS console
5. Verify `rekognition_collection_id` set to NULL in DB
6. Run again to test idempotency (should handle gracefully)

### Observability requirements

- Log: Event ID, collection ID, deletion timestamp
- Log: Success vs failure counts per run
- Log: Total run duration
- Log: Error details for failed deletions (with event ID for debugging)

### Cost impact

- Rekognition collection storage: ~$1/month per collection (AWS charges)
- Cleanup reduces ongoing costs significantly for inactive events
- Worker execution: negligible (runs once per day, processes N events in seconds)
