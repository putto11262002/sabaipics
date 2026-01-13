# Implementation Plan

Task: T-20 — Rekognition cleanup cron job
Root: docs/logs/BS_0001_S-1/
Date: 2026-01-13
Owner: Claude Code

## Inputs
- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: T-20, lines 511-533)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-20/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-20/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-20/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-20/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-20/context/risk-scout.md`

## Goal / non-goals

### Goal
Create a daily cron job that cleans up AWS Rekognition collections for events older than 30 days to reduce storage costs while preserving all photo data and face metadata in the database.

**Cleanup scope (confirmed by user):**
1. Soft-delete all non-deleted photos for expired events (set `deletedAt`)
2. Delete the Rekognition collection from AWS
3. Clear the `rekognitionCollectionId` field in the event record

### Non-goals
- Hard-deleting photos from R2 (photos kept forever per plan)
- Deleting events from database (events kept forever)
- Deleting face metadata from database (kept for model training)
- Deleting QR codes (handled by separate R2 lifecycle rule)

## Approach (data-driven)

### Architecture
T-20 will be the **first scheduled task** in the codebase. Following Cloudflare Workers cron patterns and the user's guidance:

**File structure:**
```
apps/api/src/crons/
├── cleanup.ts          # Main cleanup handler logic
└── index.ts            # Unified scheduled() export with routing
apps/api/src/index.ts   # Export scheduled handler
apps/api/wrangler.jsonc # Configure cron trigger
```

### Implementation strategy

**Step 1: Query expired events**
```typescript
// Find events where:
// - created_at < NOW() - INTERVAL '30 days'
// - rekognition_collection_id IS NOT NULL
// - expires_at < NOW() (double-check expired)
// LIMIT 10 (safety limit per run)
```

**Step 2: Batch soft-delete all photos (1 DB call)**
```typescript
// Collect all event IDs
const eventIds = events.map(e => e.id);

// Single UPDATE for all photos across all events
await db.update(photos)
  .set({ deletedAt: new Date().toISOString() })
  .where(and(
    inArray(photos.eventId, eventIds),
    isNull(photos.deletedAt)
  ))
  .returning({ id: photos.id });
```

**Step 3: Delete collections in parallel (Promise.all)**
```typescript
// Delete all collections simultaneously
const results = await Promise.allSettled(
  events.map(event =>
    deleteCollection(client, event.id)
      .then(() => ({ eventId: event.id, status: 'success' }))
      .catch(err => ({ eventId: event.id, status: 'failed', error: err }))
  )
);
```

**Step 4: Batch update events (1 DB call)**
```typescript
// Clear collection IDs for all events (even failed ones for idempotency)
await db.update(events)
  .set({ rekognitionCollectionId: null })
  .where(inArray(events.id, eventIds));
```

**Step 5: Log summary**
- Structured logging with counts, success/failure breakdown

**Step 3: Return summary**
```typescript
{
  totalProcessed: number,
  successCount: number,
  failureCount: number,
  photosDeleted: number
}
```

### Evidence from codebase

**Soft-delete pattern (T-19):**
- File: `apps/api/src/routes/photos.ts:729-737`
- Pattern: `update(photos).set({ deletedAt: new Date().toISOString() }).where(and(...))`
- Returns affected row count via `.returning()`

**Rekognition deletion (T-17):**
- File: `apps/api/src/lib/rekognition/client.ts:170-178`
- Function: `deleteCollection(client, eventId)` already exists
- Collection ID = event UUID directly (no prefix)

**Batch processing pattern (T-17):**
- File: `apps/api/src/queue/photo-consumer.ts:426-593`
- Pattern: Process items individually in try-catch
- Continue on errors, log each success/failure
- Return summary stats

**Database query helpers:**
- Use `and()`, `lt()`, `isNotNull()` from `drizzle-orm`
- Date calculation: `sql\`NOW() - INTERVAL '30 days'\``
- Safety: Always include `LIMIT` clause

### Cron configuration

**wrangler.jsonc (per-environment):**
```jsonc
{
  "env": {
    "staging": {
      "triggers": {
        "crons": ["0 20 * * *"]  // Daily at 3 AM Bangkok (8 PM UTC, Thailand UTC+7)
      }
    },
    "production": {
      "triggers": {
        "crons": ["0 20 * * *"]  // Daily at 3 AM Bangkok (8 PM UTC, Thailand UTC+7)
      }
    }
  }
}
```

**Cron handler export pattern:**
```typescript
// apps/api/src/crons/index.ts
export async function scheduled(
  controller: ScheduledController,
  env: Bindings,
  ctx: ExecutionContext
): Promise<void> {
  switch (controller.cron) {
    case "0 20 * * *":  // 3 AM Bangkok time
      ctx.waitUntil(cleanupExpiredEvents(env));
      break;
  }
}

// apps/api/src/index.ts
export { scheduled } from './crons';
```

## Contracts (only if touched)

### DB
No schema changes required. Uses existing fields:
- `events.rekognitionCollectionId` (nullable text) - set to NULL
- `events.createdAt` (timestamptz) - query for 30-day threshold
- `events.expiresAt` (timestamptz) - double-check expired
- `photos.deletedAt` (timestamptz) - set for soft-delete
- `photos.eventId` (uuid) - FK to events

### API
No new API endpoints. This is a scheduled background job.

### Jobs/events
New cron trigger:
- Schedule: `0 3 * * *` (daily at 3 AM UTC)
- Handler: `scheduled()` function in worker
- Execution: Best-effort by Cloudflare (highly reliable)

## Success path

1. **Cron triggers** at 3 AM Bangkok time (8 PM UTC) daily
2. **Query** finds 0-10 expired events with collection IDs (1 DB call, ~50ms)
3. **Batch soft-delete** all photos for those events (1 DB call, ~100ms)
4. **Parallel AWS deletion** of all collections using `Promise.allSettled` (10 parallel calls, ~200ms total)
5. **Batch update** events to clear collection IDs (1 DB call, ~50ms)
6. **Log summary:** "Processed 5 events, 4 succeeded, 1 failed, 750 photos deleted"
7. **Next day:** Cron runs again, skips already-cleaned events (collection ID is NULL)

**Performance (optimized):**
- Total DB calls: 3 (query + photos update + events update)
- Total AWS calls: 10 (parallel, not sequential)
- Total execution time: <500ms for 10 events (vs ~2 seconds sequential)

## Failure modes / edge cases (major only)

### 1. Collection already deleted (ResourceNotFoundException)
- **Scenario:** Manual deletion or previous run partially succeeded
- **Handling:** Catch exception, treat as success, update DB anyway
- **Evidence:** `client.ts:82-95` shows error classification pattern

### 2. AWS throttling (ThrottlingException)
- **Scenario:** Hitting 50 TPS Rekognition limit
- **Handling:** Log error, continue to next event (will retry tomorrow)
- **Mitigation:** Batch limit of 10 per run (stays under rate limit)

### 3. Database connection timeout
- **Scenario:** Neon serverless cold start or network issue
- **Handling:** Entire cron fails, will retry tomorrow
- **No data loss:** Operations are idempotent

### 4. Race condition with ongoing uploads
- **Scenario:** Photo uploaded to expired event, queued for indexing
- **Mitigation:** Upload endpoint checks `expiresAt`, returns 410 Gone
- **Evidence:** `apps/api/src/routes/photos.ts:378-384` validates event not expired
- **Queue consumer:** Will recreate collection if needed (inefficient but safe)

### 5. Partial failure (some events succeed, some fail)
- **Scenario:** Event #3 fails, but #1, #2, #4, #5 succeed
- **Handling:** Log each individually, return summary stats
- **Evidence:** Pattern from `photo-consumer.ts:426-593`

### 6. No events to clean up
- **Scenario:** All events < 30 days old
- **Handling:** Query returns 0 rows, log "No events to process", exit cleanly
- **Cost:** Minimal (query only, ~50ms execution time)

## Validation plan

### Tests to add

**File:** `apps/api/src/crons/cleanup.test.ts`

**Test cases:**
1. ✅ **No expired events** → returns `{ processed: 0, succeeded: 0, failed: 0 }`
2. ✅ **One expired event** → soft-deletes photos, deletes collection, updates DB
3. ✅ **Multiple expired events** → processes all, returns accurate summary
4. ✅ **Collection already deleted** (ResourceNotFoundException) → treats as success
5. ✅ **Event without collection ID** → skips (query filters these out)
6. ✅ **Photos already soft-deleted** → skips photo update, still deletes collection
7. ✅ **Partial failures** → some succeed, some fail, continues processing all
8. ✅ **Batch limit enforcement** → respects LIMIT clause

**Mocking strategy:**
- Mock `createDb()` to return mocked Drizzle instance
- Mock `createRekognitionClient()` to return mocked AWS client
- Use `aws-sdk-client-mock` for Rekognition responses
- Spy on `console.log` / `console.error` to verify logging

### Commands to run

**Type check:**
```bash
pnpm --filter=@sabaipics/api check-types
```

**Run tests:**
```bash
pnpm --filter=@sabaipics/api test crons/cleanup.test.ts
```

**Build:**
```bash
pnpm --filter=@sabaipics/api build
```

**Local cron trigger (manual testing):**
```bash
# Start dev server
pnpm --filter=@sabaipics/api dev

# In another terminal, trigger scheduled event
curl "http://localhost:8787/__scheduled?cron=0+3+*+*+*"
```

**Staging deployment:**
```bash
pnpm --filter=@sabaipics/api pages:deploy
```

## Rollout / rollback

### Phase 1: Dry-run (Manual verification) 🚨 HI GATE
1. Deploy code to staging WITHOUT cron trigger configured
2. Create test events with backdated `createdAt` (> 30 days ago)
3. Manually seed Rekognition collections for test events
4. Trigger manually: `curl http://localhost:8787/__scheduled?cron=0+3+*+*+*`
5. **Verify:**
   - Photos marked as `deletedAt` (check DB)
   - Collections deleted from AWS (check AWS console)
   - Event `rekognitionCollectionId` set to NULL (check DB)
   - Logs show correct counts
6. Run again to test idempotency (should skip already-cleaned events)

**🛑 STOP for HI approval before Phase 2**

### Phase 2: Staging with cron (Automated) 🚨 HI GATE
1. Configure cron trigger in `wrangler.jsonc` (staging env only)
2. Deploy to staging
3. Monitor for 7 days:
   - Check logs daily for errors
   - Verify collections being deleted
   - Check for any upload failures
4. Metrics to track:
   - Events processed per day
   - Success vs failure rate
   - Photos deleted per day
   - Cron execution time

**🛑 STOP for HI approval before Phase 3**

### Phase 3: Production rollout
1. Configure cron trigger in `wrangler.jsonc` (production env)
2. Deploy to production
3. Start with batch limit of 5 (conservative)
4. Monitor for 1 week, increase to 10 if stable
5. Set up alerts:
   - >20 collections deleted in 24h (potential runaway)
   - >3 deletion failures in single run (AWS issue)
   - Cron execution time >5 minutes (performance issue)

### Rollback procedure
**If issues detected:**
1. Remove cron trigger from `wrangler.jsonc`
2. Redeploy (cron stops running)
3. Investigate issue in logs
4. Fix and re-test in staging

**Data recovery (worst case):**
- Rekognition collections: **CANNOT BE RECOVERED** (permanent deletion)
- Photos: Can be "undeleted" by setting `deletedAt = NULL` (DB record intact)
- Prevention is critical - hence the phased rollout with HI gates

## Open questions

### [NEED_DECISION] Retention period: 30 or 60 days?
**Context:**
- Plan specifies 30 days (`final.md:374`)
- Risk report suggests 60 days for safety margin
- Rekognition storage: ~$1/month per collection

**Options:**
1. **30 days** (as planned) - saves cost, higher risk
2. **60 days** - extra safety, 2x cost for Rekognition
3. **Configurable** - env var `RETENTION_DAYS` (default 30)

**Recommendation:** Start with 30 days (per plan), make configurable via env var for flexibility.

**Decision needed?** YES - confirm 30 days is acceptable risk, or extend to 60.

---

### [NEED_VALIDATION] Batch size: 10 per run?
**Context:**
- Risk report recommends limit of 10 for safety
- AWS Rekognition limit: 50 TPS (shared across operations)
- Typical backlog: unclear (depends on event creation rate)

**Options:**
1. **10 per run** (conservative) - processes 300/month, safe
2. **50 per run** (aggressive) - processes 1500/month, risks throttling
3. **Dynamic** - start with 10, increase if no failures

**Recommendation:** Start with 10, increase to 50 after 1 week if stable.

**Decision needed?** NO - will implement 10 with env var for adjustment.

---

### [NEED_VALIDATION] Double-check event expiry?
**Context:**
- Query uses `created_at < NOW() - 30 days`
- Risk report suggests also checking `expires_at < NOW()`
- Event creation sets `expiresAt = createdAt + 30 days`

**Risk:**
If event creation and cleanup use different logic, could delete active event.

**Mitigation:**
Add `AND expires_at < NOW()` to query for redundancy.

**Decision needed?** NO - will implement both checks for safety.

---

### [GAP] Monitoring and alerting?
**Context:**
- No monitoring infrastructure mentioned in plan
- Cloudflare Analytics provides basic metrics
- External tools: DataDog, Sentry, etc.

**Metrics needed:**
1. Collections deleted per day
2. Deletion failure rate
3. Cron execution time
4. Total Rekognition storage cost (AWS billing)

**Question:** What monitoring tool should we use?

**Recommendation:** Start with structured console logs (Cloudflare Logpush), add external monitoring later if needed.

**Decision needed?** NO - will use console logs for now, defer external monitoring to follow-up task.

---

## Implementation checklist

- [ ] Create `apps/api/src/crons/cleanup.ts` with main logic
- [ ] Create `apps/api/src/crons/index.ts` with `scheduled()` export
- [ ] Export `scheduled` from `apps/api/src/index.ts`
- [ ] Add types for `ScheduledController` to `apps/api/src/types.ts` if needed
- [ ] Write unit tests in `apps/api/src/crons/cleanup.test.ts`
- [ ] Configure cron trigger in `wrangler.jsonc` (staging first)
- [ ] Update main worker export to include `scheduled` handler
- [ ] Add env var `RETENTION_DAYS` (default 30) for flexibility
- [ ] Add env var `CLEANUP_BATCH_SIZE` (default 10) for tuning
- [ ] Test locally with manual trigger
- [ ] Deploy to staging, verify manually
- [ ] Monitor staging for 7 days (HI gate)
- [ ] Deploy to production (HI gate)
- [ ] Document monitoring/alerting strategy
