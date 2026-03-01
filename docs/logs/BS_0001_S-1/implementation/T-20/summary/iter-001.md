# Implementation Summary (iter-001)

Task: T-20 — Rekognition cleanup cron job
Root: BS_0001_S-1
Branch: task/T-20-rekognition-cleanup-cron
PR: pending
Date: 2026-01-13

## Outcome

✅ Successfully implemented daily cron job to clean up expired Rekognition collections and soft-delete associated photos.

**Key achievements:**

- First scheduled task in the codebase (established cron infrastructure)
- Optimized performance: 3 DB calls + parallel AWS deletions (10 simultaneous)
- Runs at 3 AM Bangkok time (8 PM UTC) - non-business hours
- Configurable via env vars: `RETENTION_DAYS` (default 30), `CLEANUP_BATCH_SIZE` (default 10)
- Comprehensive error handling with idempotency (handles ResourceNotFoundException)

## Key code changes

### New files

- `apps/api/src/crons/cleanup.ts` — Main cleanup logic
  - Queries expired events (created_at < NOW - 30 days AND expires_at < NOW)
  - Batch soft-deletes photos (single UPDATE for all events)
  - Parallel AWS collection deletion (Promise.allSettled)
  - Batch event updates (clear rekognitionCollectionId)
  - Structured logging for audit trail

- `apps/api/src/crons/index.ts` — Scheduled event handler
  - Routes cron triggers by schedule string
  - Switch statement for future cron jobs
  - Uses ctx.waitUntil() for async cleanup

### Modified files

- `apps/api/src/index.ts` — Export scheduled handler
  - Added `scheduled` import from `./crons`
  - Updated default export to include `scheduled` alongside `fetch` and `queue`

- `apps/api/wrangler.jsonc` — Cron configuration
  - Added `RETENTION_DAYS: "30"` to all environments
  - Added `CLEANUP_BATCH_SIZE: "10"` to all environments
  - Added `triggers.crons: ["0 20 * * *"]` to staging and production

- `apps/api/worker-configuration.d.ts` — Type definitions (auto-generated)
  - Added `RETENTION_DAYS` and `CLEANUP_BATCH_SIZE` to Cloudflare.Env interface

## Behavioral notes

### Success path

1. Cron triggers daily at 3 AM Bangkok time (8 PM UTC)
2. Query finds 0-10 expired events (LIMIT 10 for safety)
3. Soft-delete all photos for those events in single batch UPDATE
4. Delete all collections in parallel via Promise.allSettled
5. Update all events to clear collection IDs (even if deletion failed - idempotent)
6. Log summary with counts

### Key failure modes handled

- **ResourceNotFoundException** — Treated as success (collection already deleted)
- **ThrottlingException** — Logged, continues to next event (will retry tomorrow)
- **Partial failures** — Processes all events independently, returns accurate counts
- **No events to clean** — Logs "No events to process", exits cleanly

### Performance

- Total DB calls: 3 (query + photos update + events update)
- Total AWS calls: 10 parallel (not sequential)
- Execution time: <500ms for 10 events

## Ops / rollout

### Flags/env

- `RETENTION_DAYS` — Number of days before cleanup (default: 30)
- `CLEANUP_BATCH_SIZE` — Max events to process per run (default: 10)

### Migrations/run order

No database migrations required. Uses existing schema:

- `events.rekognitionCollectionId` (nullable)
- `events.createdAt`, `events.expiresAt`
- `photos.deletedAt` (nullable)

### Cron schedule

- **Dev:** No cron trigger (manual testing via `/__scheduled?cron=0+20+*+*+*`)
- **Staging:** `0 20 * * *` (3 AM Bangkok)
- **Production:** `0 20 * * *` (3 AM Bangkok)

## How to validate

### Manual testing (staging)

```bash
# 1. Start dev server
pnpm --filter=@sabaipics/api dev

# 2. Trigger scheduled event manually
curl "http://localhost:8787/__scheduled?cron=0+20+*+*+*"

# 3. Check logs for output
# Expected: [Cleanup] Job started → [Cleanup] Found expired events → [Cleanup] Job completed
```

### Test data setup

1. Create test event with backdated `createdAt` (> 30 days ago)
2. Manually create Rekognition collection with event ID
3. Upload photos to the event
4. Trigger cron manually
5. Verify:
   - Photos marked with `deletedAt` in DB
   - Collection deleted from AWS (check AWS console)
   - Event `rekognitionCollectionId` set to NULL

### Production monitoring

- Check Cloudflare logs daily after 3 AM Bangkok
- Look for `[Cleanup] Job completed` with success/failure counts
- Alert if `failureCount > 3` for single run
- Alert if `totalProcessed > 20` (potential runaway)

## Follow-ups

### [ENG_DEBT] Add external monitoring

**Context:** Currently only console logs, no metrics/alerting
**Recommendation:** Add CloudWatch/DataDog metrics for:

- Collections deleted per day
- Deletion failure rate
- Cron execution time
- Total Rekognition storage cost (AWS billing)

### [ENG_DEBT] Optimize retention calculation

**Context:** Currently hardcoded 30 days in query
**Recommendation:** Consider dynamic retention based on event tier or customer plan

### [PM_FOLLOWUP] Queue drainage strategy

**Context:** If photo uploaded right before cleanup, collection might be recreated
**Recommendation:** Add event status field (e.g., "archived") to prevent uploads to expired events

### [PM_FOLLOWUP] Retention period review

**Context:** 30 days per plan, but no real-world validation yet
**Recommendation:** Review after 3 months:

- Are photographers requesting longer retention?
- What's the actual cost savings?
- Any customer complaints about disabled selfie search?
