# Implementation Plan v2 (Queue-Based)

Task: T-20 — Rekognition cleanup cron job (REFACTORED)
Root: docs/logs/BS_0001_S-1/
Date: 2026-01-13
Owner: Claude Code
Version: 2 (Queue-based architecture per code review feedback)

## Changes from v1

**Original design issues (per PR review):**
- ❌ Risky: Batch DB + parallel AWS calls in cron handler with no retry mechanism
- ❌ No DLQ for failed operations
- ❌ No individual retry logic per event
- ❌ All-or-nothing approach (10 events in ~500ms)

**New design benefits:**
- ✅ Queue-based: Each event processed individually with retries
- ✅ DLQ: Failed operations after 3 retries go to dead letter queue
- ✅ Idempotent: State-based cleanup (check before action)
- ✅ Resilient: DB errors, AWS throttling, partial failures all handled gracefully

## Inputs
- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: T-20, lines 511-533)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports: `docs/logs/BS_0001_S-1/implementation/T-20/context/*`
- Code review: https://github.com/putto11262002/sabaipics/pull/31#pullrequestreview-2525383891
- Reference implementation: `apps/api/src/queue/photo-consumer.ts` (existing queue pattern)

## Goal / non-goals

### Goal
Implement **queue-based** daily cleanup of AWS Rekognition collections for expired events (30+ days old), with robust retry logic and idempotent state-based operations.

**Architecture:**
1. **Cron** (lightweight) → Query expired events → Send to queue
2. **Queue consumer** (heavy) → State-based cleanup → Retry on failure → DLQ after 3 attempts

**Cleanup operations (per event):**
1. Soft-delete photos (set `deletedAt` timestamp)
2. Delete Rekognition collection from AWS
3. Clear `rekognitionCollectionId` from event record

### Non-goals
- Hard-deleting photos from R2 (kept forever per plan)
- Deleting events from database (kept forever)
- Deleting face metadata from database (kept for model training)
- Audit logging to DB table (structured console logs sufficient)

## Approach (queue-based, data-driven)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ CRON (Daily 3 AM Bangkok)                                   │
│ apps/api/src/crons/cleanup.ts                               │
│                                                              │
│ 1. Query expired events (LIMIT 10)                          │
│ 2. Send each to CLEANUP_QUEUE                               │
│ 3. Exit (lightweight, no DB updates)                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼ Queue message per event
┌─────────────────────────────────────────────────────────────┐
│ QUEUE CONSUMER (rekognition-cleanup)                        │
│ apps/api/src/queue/cleanup-consumer.ts                      │
│                                                              │
│ 1. Check current state (photos deleted? collection exists?) │
│ 2. Determine actions needed (state-based)                   │
│ 3. Execute cleanup actions (idempotent)                     │
│ 4. message.ack() or message.retry()                         │
└─────────────────┬────────────────────────────────────┬──────┘
                  │                                     │
          Success │                             Failure│ (after 3 retries)
                  ▼                                     ▼
            [Complete]                    [Dead Letter Queue]
```

### State-Based Cleanup Logic

**Decision tree (check state first):**

```
Query Event from DB:
├─ photosNotDeleted=true, collectionId!=null
│  └─ State: Fresh event, never cleaned
│  └─ Actions: [soft_delete, delete_collection, update_event]
│
├─ photosNotDeleted=false, collectionId!=null
│  └─ State: Photos deleted, but AWS failed previously
│  └─ Actions: [delete_collection, update_event]
│
├─ photosNotDeleted=true, collectionId=null
│  └─ State: Edge case - AWS deleted but photos not
│  └─ Actions: [soft_delete]
│
└─ photosNotDeleted=false, collectionId=null
   └─ State: Fully complete
   └─ Actions: [] (skip all, message.ack())
```

**Why state-based?**
- Handles partial failures from previous attempts
- Idempotent: Can run multiple times safely
- Resilient: AWS succeeds but DB fails? Next retry fixes DB only

### Implementation Components

#### 1. Cron Handler (Producer)

**File:** `apps/api/src/crons/cleanup.ts`

**Responsibilities:**
- Query expired events (LIMIT 10 for safety)
- Send each event to `CLEANUP_QUEUE`
- No DB updates, no AWS calls (lightweight)

**Key code:**
```typescript
const expiredEvents = await db.select({
  id: events.id,
  collectionId: events.rekognitionCollectionId,
})
.from(events)
.where(and(
  lt(events.createdAt, sql`NOW() - INTERVAL '30 days'`),
  lt(events.expiresAt, sql`NOW()`),
  // Don't filter by collectionId - let consumer handle all states
))
.limit(10);

for (const event of expiredEvents) {
  await env.CLEANUP_QUEUE.send({
    event_id: event.id,
    collection_id: event.collectionId, // Can be null
  });
}
```

**Change from v1:** No batch DB operations, no AWS calls in cron.

#### 2. Queue Consumer (Heavy Lifting)

**File:** `apps/api/src/queue/cleanup-consumer.ts`

**Responsibilities:**
- Check current state (photos deleted? collection exists?)
- Determine actions needed based on state
- Execute cleanup actions (idempotent operations)
- Handle retries with exponential backoff
- Use neverthrow for error composition

**Pattern (from photo-consumer.ts):**
```typescript
export async function queue(
  batch: MessageBatch<CleanupJob>,
  env: Bindings
): Promise<void> {
  const db = createDb(env.DATABASE_URL);
  const client = createRekognitionClient(env);

  for (const message of batch.messages) {
    const { event_id } = message.body;

    // 1. Check state
    const stateResult = await getEventState(db, event_id);

    // 2. Determine actions
    const actions = determineActions(state);

    // 3. Execute cleanup
    const result = await executeCleanup(db, client, event_id, actions);

    // 4. Handle result
    result.match(
      (summary) => {
        console.log('[Cleanup] Success', { eventId: event_id, summary });
        message.ack();
      },
      (error) => {
        if (!error.retryable) {
          message.ack(); // Give up → DLQ
        } else if (error.isThrottle) {
          message.retry({ delaySeconds: getThrottleBackoffDelay(message.attempts) });
        } else {
          message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
        }
      }
    );
  }
}
```

**Key patterns:**
- Use existing `getBackoffDelay()` and `getThrottleBackoffDelay()` from rekognition/errors.ts
- Use neverthrow for error composition
- Use `.orElse()` to remap ResourceNotFoundException → success

#### 3. Queue Configuration

**File:** `apps/api/wrangler.jsonc`

```jsonc
"queues": {
  "producers": [
    { "queue": "rekognition-cleanup", "binding": "CLEANUP_QUEUE" }
  ],
  "consumers": [
    {
      "queue": "rekognition-cleanup",
      "max_batch_size": 10,
      "max_batch_timeout": 30,
      "max_retries": 3,
      "max_concurrency": 1,  // Sequential processing (safe)
      "dead_letter_queue": "rekognition-cleanup-dlq"
    }
  ]
}
```

**Rationale:**
- `max_retries: 3` - 3 attempts per message before DLQ
- `max_concurrency: 1` - Sequential batches (no AWS throttling risk)
- `max_batch_size: 10` - Match cron batch size
- DLQ for manual intervention on persistent failures

#### 4. Error Handling (neverthrow)

**Use `.orElse()` for ResourceNotFoundException:**

```typescript
const awsResult = await ResultAsync.fromPromise(
  deleteCollection(client, eventId),
  (e: any) => new CleanupError('AWS_DELETE_FAILED', {
    name: e.name,
    retryable: ['ThrottlingException', 'ServiceUnavailableException'].includes(e.name),
    isThrottle: e.name === 'ThrottlingException',
    cause: e
  })
).orElse((error) => {
  // Remap ResourceNotFoundException → success
  if (error.name === 'ResourceNotFoundException') {
    return ok({ alreadyDeleted: true });
  }
  return err(error);
});
```

**Retry strategy:**
- **DB errors:** Retryable (exponential backoff: 2s, 4s, 8s)
- **ThrottlingException:** Retryable (longer backoff: 5s, 10s, 20s)
- **ResourceNotFoundException:** Success (collection already deleted)
- **Other AWS errors:** Non-retryable → DLQ

## Contracts (only if touched)

### DB
No schema changes required. Uses existing fields:
- `events.rekognitionCollectionId` (nullable text) - set to NULL
- `events.createdAt` (timestamptz) - query for 30-day threshold
- `events.expiresAt` (timestamptz) - double-check expired
- `photos.deletedAt` (timestamptz) - set for soft-delete
- `photos.eventId` (uuid) - FK to events

### Queue
New queue binding:
- **Name:** `rekognition-cleanup`
- **Binding:** `CLEANUP_QUEUE` (producer in cron)
- **Consumer:** `cleanup-consumer.ts` (export as `cleanupQueue` function)
- **Message schema:**
  ```typescript
  interface CleanupJob {
    event_id: string;
    collection_id: string | null;
  }
  ```

### Cron
No changes to cron schedule (`0 20 * * *` = 3 AM Bangkok).

## Success path

1. **Cron triggers** at 3 AM Bangkok time daily
2. **Query** finds 0-10 expired events
3. **Queue** receives 10 messages (one per event)
4. **Consumer** processes each event:
   - Check state: Photos deleted? Collection exists?
   - Execute actions: Soft-delete photos → Delete AWS → Update DB
   - Ack on success
5. **Next day:** Cron runs again, skips already-cleaned events

**Performance:**
- Cron: <1 second (lightweight query + queue send)
- Consumer: ~10-30 seconds per batch (10 events × 1-3 seconds each)
- Total latency: 10-30 seconds (vs ~500ms in v1, but more reliable)

## Failure modes / edge cases (major only)

### 1. Collection already deleted (ResourceNotFoundException)
- **Handling:** Use `.orElse()` to convert to success
- **Action:** Log "already deleted", continue to event update
- **Result:** Idempotent, no retry needed

### 2. AWS throttling (ThrottlingException)
- **Handling:** `message.retry()` with longer backoff (60s, 120s, 240s)
- **Action:** Queue retries message automatically
- **Result:** Succeeds on retry when rate limit resets

### 3. Photos deleted, AWS fails, DB not updated
- **State:** `photosNotDeleted=false, collectionId!=null`
- **Retry:** Skip photo deletion (already done), retry AWS + DB
- **Result:** Eventually consistent

### 4. All 3 retries fail
- **Handling:** Message goes to DLQ (`rekognition-cleanup-dlq`)
- **Action:** Manual intervention required
- **Monitoring:** Alert on DLQ depth > 0

### 5. DB connection timeout
- **Handling:** DB errors are retryable
- **Action:** `message.retry()` with exponential backoff
- **Result:** Succeeds on retry when DB connection available

### 6. Zero photos for event
- **Behavior:** `photosNotDeleted=false` (no photos to delete)
- **Action:** Skip soft-delete, still delete AWS collection if exists
- **Result:** Safe, idempotent

## Validation plan

### Unit Tests
**File:** `apps/api/src/queue/cleanup-consumer.test.ts`

**Test cases:**
1. ✅ State fully complete (photosDeleted=true, collectionId=null) → ack immediately
2. ✅ Fresh event (photosDeleted=false, collectionId!=null) → all 3 actions
3. ✅ Photos deleted, AWS pending (photosDeleted=true, collectionId!=null) → skip photos
4. ✅ ResourceNotFoundException → treat as success
5. ✅ ThrottlingException → retry with long delay
6. ✅ DB error → retry with exponential backoff
7. ✅ Non-retryable error → ack (goes to DLQ)

### Commands to run

**Type check:**
```bash
pnpm --filter=@sabaipics/api check-types
```

**Build:**
```bash
pnpm --filter=@sabaipics/api build
```

**Local cron trigger:**
```bash
pnpm --filter=@sabaipics/api dev
curl "http://localhost:8787/__scheduled?cron=0+20+*+*+*"
```

**Check queue processing:**
```bash
# Monitor Cloudflare dashboard for queue metrics
# Check logs for [Cleanup] entries
```

## Rollout / rollback

### Phase 1: Dry-run (Manual verification) 🚨 HI GATE
1. Deploy code to staging WITHOUT enabling cron
2. Create test events with backdated `createdAt` (> 30 days ago)
3. Manually trigger cron: `curl http://localhost:8787/__scheduled?cron=0+20+*+*+*`
4. **Verify:**
   - Queue receives messages
   - Consumer processes messages
   - Photos marked with `deletedAt`
   - Collections deleted from AWS
   - Event `rekognitionCollectionId` set to NULL
   - Logs show correct state transitions
5. Test retry: Kill worker mid-processing, verify retry works

**🛑 STOP for HI approval before Phase 2**

### Phase 2: Staging with cron (Automated) 🚨 HI GATE
1. Enable cron trigger in staging `wrangler.jsonc`
2. Deploy to staging
3. Monitor for 7 days:
   - Check logs daily after 3 AM Bangkok
   - Verify queue metrics (success rate, DLQ depth)
   - Check for any throttling errors
4. Metrics to track:
   - Events processed per day
   - Success rate (target: >95%)
   - Retry rate (target: <10%)
   - DLQ depth (target: 0)

**🛑 STOP for HI approval before Phase 3**

### Phase 3: Production rollout
1. Enable cron in production `wrangler.jsonc`
2. Deploy to production
3. Monitor closely for first week
4. Set up alerts:
   - DLQ depth > 0 (manual intervention needed)
   - Success rate < 90% (investigate issues)
   - Cron execution failures

### Rollback procedure
**If issues detected:**
1. Remove cron trigger from `wrangler.jsonc`
2. Redeploy (cron stops queuing messages)
3. Existing queue messages will still be processed (drain queue)
4. Investigate issue in logs
5. Fix and re-test in staging

**Data recovery (worst case):**
- Rekognition collections: **CANNOT BE RECOVERED** (permanent deletion)
- Photos: Can "undelete" by setting `deletedAt = NULL`
- Prevention is critical - hence phased rollout with HI gates

## Open questions

### Resolved (per discussion)

1. ✅ **State checking:** Use Design A (idempotent operations, no extra queries)
2. ✅ **ResourceNotFoundException:** Use `.orElse()` to remap to success
3. ⏭️ **Audit logging:** Out of scope (use console logs)
4. ✅ **Concurrency:** `max_concurrency: 1` (sequential processing)

### New questions

1. **Queue naming consistency:** Should consumer export be `queue` or `cleanupQueue`?
   - Photo consumer: `export async function queue()`
   - Cleanup consumer: `export async function queue()` OR `export async function cleanupQueue()`?
   - **Recommendation:** Use `queue` for consistency, route by queue name in wrangler.jsonc

2. **Error class location:** Create new `CleanupError` or reuse `RekognitionError`?
   - **Recommendation:** Create `CleanupError` in `queue/cleanup-consumer.ts` (specific to cleanup logic)

3. **Retry backoff helpers:** Reuse from `lib/rekognition/errors.ts` or create new?
   - **Recommendation:** Reuse existing `getBackoffDelay()` and `getThrottleBackoffDelay()`

## Implementation checklist

- [ ] Refactor `apps/api/src/crons/cleanup.ts` to be lightweight (query + queue only)
- [ ] Create `apps/api/src/queue/cleanup-consumer.ts` with state-based logic
- [ ] Add `CLEANUP_QUEUE` producer binding to `wrangler.jsonc`
- [ ] Add `rekognition-cleanup` consumer config to `wrangler.jsonc`
- [ ] Export `cleanupQueue` from `apps/api/src/index.ts` (or route by queue name)
- [ ] Update type definitions if needed (`CleanupJob` interface)
- [ ] Remove old batch operations from cleanup.ts (no longer needed)
- [ ] Test locally with manual cron trigger + queue monitoring
- [ ] Update implementation summary with v2 changes

## Evidence from codebase

**Queue pattern reference:**
- `apps/api/src/queue/photo-consumer.ts:426-593` - Batch processing with per-message ack/retry
- `apps/api/src/lib/rekognition/errors.ts:73-105` - Backoff delay helpers

**Queue config reference:**
- `apps/api/wrangler.jsonc:38-55` - Photo queue configuration (existing pattern to follow)

**State checking pattern:**
- Current design: Query once, execute all actions (idempotent WHERE clauses)
- No complex state machine needed (simpler than discussed)

## Performance comparison

### v1 (Batch operations in cron)
- Cron: 3 DB calls + 10 parallel AWS calls = ~500ms
- Retry: None (all-or-nothing)
- Risk: High (no retry, AWS throttling risk, partial failures)

### v2 (Queue-based)
- Cron: 1 DB query + 10 queue sends = ~200ms
- Consumer: 10 events × (1 DB query + 1-3 actions) = ~10-30 seconds
- Retry: Per-event with exponential backoff
- Risk: Low (isolated failures, DLQ for manual intervention)

**Trade-off:** Slower (10-30s vs 500ms) but much more reliable and maintainable.
