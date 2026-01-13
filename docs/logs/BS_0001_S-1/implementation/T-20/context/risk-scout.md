# Risk Scout: T-20 Rekognition Cleanup Cron Job

**Task:** T-20 - Rekognition cleanup cron job
**Root:** BS_0001_S-1
**Date:** 2026-01-13

---

## Executive Summary

T-20 is a **MEDIUM-HIGH RISK** task that implements automated cleanup of AWS Rekognition collections for events older than 30 days. This is a cost-saving measure (Rekognition storage is expensive) while preserving all photo data and face metadata in the database.

**Critical characteristics:**
1. **Irreversible AWS resource deletion** - collections cannot be recovered
2. **Daily cron job** - runs automatically without human oversight
3. **Batch deletion** - operates on multiple events at once
4. **30-day retention logic** - based on `events.created_at`, not `expires_at`
5. **Partial failure handling** - some collections may fail to delete

**Key decision from plan (final.md line 374-376):**
> Delete Rekognition collection 30 days after event created
> After 30 days: gallery works, face counts visible, but selfie search disabled

**Infrastructure exists:**
- `deleteCollection()` function in `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/lib/rekognition/client.ts` (line 170-178)
- Event schema has `rekognitionCollectionId` nullable field (`/Users/putsuthisrisinlpa/Development/sabai/sabaipics/packages/db/src/schema/events.ts` line 20)
- Event expiry calculation: `created_at + 30 days` (`/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/routes/events/index.ts` line 182-184)

**Infrastructure missing:**
- No cron trigger configured in `wrangler.jsonc`
- No cron handler in `apps/api/src/cron/`
- No audit logging for deletions
- No monitoring/alerting

---

## High Risks (require HI gates or mitigation)

### 1. Wrong Events Deleted (Data Integrity)

**Impact:** CRITICAL - permanent loss of face search capability for active events

**Scenario:**
- Query logic error selects events with `created_at < NOW - 30 days` but event is still active
- Timezone handling error (DB stores timestamptz, cron runs in UTC)
- Off-by-one error in date calculation

**Evidence of risk:**
- Event expiry is `created_at + 30 days` (line 182-184 in events/index.ts)
- But cleanup should use same calculation, not hardcoded 30
- If event creation and cleanup use different logic, mismatch possible

**Current code pattern:**
```typescript
// Event creation (apps/api/src/routes/events/index.ts:182-184)
const expiresAt = new Date();
expiresAt.setDate(expiresAt.getDate() + 30);
```

**Cleanup query should be:**
```sql
WHERE created_at < NOW() - INTERVAL '30 days'
  AND rekognition_collection_id IS NOT NULL
```

**Mitigation:**
1. **HI gate:** Dry-run mode first - log which events would be deleted without actually deleting
2. **Add safety check:** Also verify `expires_at < NOW()` to double-check event is truly expired
3. **Limit batch size:** Delete max 10 collections per run to limit blast radius
4. **Manual approval:** First 3 runs should be manually triggered and verified

**HI gate needed?** YES - require manual dry-run verification before enabling cron

---

### 2. Collection Deletion Succeeds but DB Update Fails (Consistency)

**Impact:** HIGH - DB shows collection exists but AWS returns ResourceNotFoundException on search

**Scenario:**
1. Cron calls `deleteCollection(client, eventId)` - succeeds
2. Network error or DB connection timeout before updating `rekognitionCollectionId = NULL`
3. Event record still has collection ID, but collection no longer exists in AWS

**Consequence:**
- Future selfie search attempts will fail with ResourceNotFoundException
- No recovery mechanism - collection is permanently gone
- User sees "search unavailable" error even though DB says it should work

**Mitigation:**
1. **Idempotent deletion:** Wrap in try-catch, ignore ResourceNotFoundException (already deleted)
2. **DB update first:** Set `rekognition_collection_id = NULL` BEFORE calling AWS API
3. **Audit log:** Record deletion attempt with timestamp before AWS call
4. **Retry logic:** If AWS call fails, retry up to 3 times before giving up

**HI gate needed?** NO - but implementation must handle this explicitly

---

### 3. Race Condition with Ongoing Uploads/Indexing

**Impact:** MEDIUM - photo indexing fails because collection deleted mid-processing

**Scenario:**
1. Event created 30 days ago at 2026-01-13 00:00 UTC
2. Photographer uploads new photo at 2026-02-12 23:59 UTC (1 minute before 30-day mark)
3. Photo queued for indexing
4. Cron runs at 2026-02-13 00:01 UTC, deletes collection
5. Queue consumer tries to index face - collection not found

**Evidence of risk:**
- Photo queue consumer checks if collection exists, creates if missing (photo-consumer.ts line 310-359)
- But if cron deletes between check and IndexFaces call, race condition occurs
- Queue consumer will recreate collection (line 321), but this is wasteful

**Current safeguard:**
- Queue consumer handles `ResourceNotFoundException` and recreates collection
- But this means cleanup is ineffective if uploads continue

**Mitigation:**
1. **Check event expiry:** Only delete collections for events where `expires_at < NOW()` (not just created_at)
2. **Lock events:** Update event status to "archived" before deletion to prevent new uploads
3. **Drain queue first:** Ensure no pending jobs for event before deletion
4. **Scheduled deletion:** Run cron at low-traffic time (e.g., 3 AM UTC)

**HI gate needed?** NO - but must verify queue is empty for target events

---

### 4. Runaway Deletions (Operational)

**Impact:** MEDIUM - accidentally delete all collections if logic error

**Scenario:**
- Query logic error returns ALL events instead of only old ones
- Example: `WHERE created_at < NOW()` instead of `WHERE created_at < NOW() - INTERVAL '30 days'`
- Cron deletes hundreds or thousands of collections in one run

**Mitigation:**
1. **Batch size limit:** Hard limit of 10 collections per cron invocation
2. **Query validation:** Add explicit `LIMIT 100` to query
3. **Monitoring:** Alert if >20 collections deleted in 24-hour period
4. **Circuit breaker:** If >5 collections fail to delete, stop and alert

**HI gate needed?** YES - manual verification of first 3 cron runs

---

### 5. Cost Accumulation from Failed Deletions

**Impact:** LOW-MEDIUM - continued storage costs if deletions fail silently

**Scenario:**
- AWS API throttling or permissions error prevents deletion
- Cron marks attempt as "complete" but collection still exists
- Collections accumulate over time, storage costs grow

**Rekognition collection storage pricing:**
- First 1M faces: $0.001 per face per month
- If cleanup fails, costs compound monthly

**Mitigation:**
1. **Retry failed deletions:** Maintain list of failed deletions, retry on next run
2. **Alert on failures:** Send notification if >3 deletions fail in single run
3. **Manual cleanup:** Monthly audit to identify orphaned collections

**HI gate needed?** NO - monitoring sufficient

---

## Medium Risks (address in implementation)

### 1. No Audit Trail for Deletions

**Impact:** Cannot verify what was deleted or when

**Mitigation:**
- Log each deletion with: `event_id`, `collection_id`, `created_at`, `deleted_at`, `deletion_reason`
- Store in DB table or structured logs (JSON to CloudWatch)
- Retention: 90 days minimum

**Implementation:**
```typescript
console.log('[Cleanup] Deleting collection', {
  eventId: event.id,
  collectionId: event.rekognitionCollectionId,
  eventCreatedAt: event.createdAt,
  eventAge: daysOld,
  deletedAt: new Date().toISOString(),
});
```

---

### 2. AWS Rate Limits (Throttling)

**Impact:** Cron job fails if many collections to delete

**AWS Rekognition limits:**
- DeleteCollection: 50 TPS (shared with IndexFaces)
- If cron tries to delete 100 collections at once, may hit throttling

**Mitigation:**
- Limit batch size to 10 per run
- Add 100ms delay between deletions
- Handle ThrottlingException with exponential backoff

---

### 3. Cron Scheduling Conflicts

**Impact:** Multiple invocations run concurrently, attempt to delete same collections

**Cloudflare Cron Triggers behavior:**
- If previous invocation still running when next scheduled, both run
- Can cause duplicate deletion attempts (harmless but wasteful)

**Mitigation:**
- Use Durable Object lock to ensure single invocation
- Or: check last run timestamp, skip if <23 hours since last completion

---

### 4. No Rollback Mechanism

**Impact:** Cannot undo accidental deletions

**Reality:** Rekognition collection deletion is permanent. Once deleted, face search capability is lost.

**Mitigation:**
- Prevention is only option (see High Risks mitigations)
- Document recovery procedure: "Re-upload photos and re-index" (expensive, time-consuming)
- Consider: keep collection for 60 days instead of 30 (extra safety margin)

**[NEED_DECISION]** Should retention be 30 or 60 days? 30 days is from plan, but 60 provides safety buffer.

---

## Hidden Coupling (found or suspected)

### 1. Face Search Dependency (S-2 out of scope)

**Location:** Not yet implemented (selfie search is S-2)

**Coupling:** Future search feature will query collections by `rekognitionCollectionId`

**Impact:** If search is implemented later, must handle NULL collection IDs gracefully

**Note in code:** Event schema shows collection is nullable (events.ts line 20)
- Queries must use `WHERE rekognition_collection_id IS NOT NULL` to exclude cleaned-up events

---

### 2. Photo Status Assumptions

**Location:** `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/routes/photos.ts` line 182

**Coupling:** Photo listing excludes soft-deleted photos (`isNull(photos.deletedAt)`)

**Impact:** If cleanup also soft-deletes photos, ensure consistency

**But plan says (line 374):** "Keep photos and DB forever, only delete Rekognition collection"

**Action:** Verify task spec - are we ONLY deleting collection, or also soft-deleting photos?

**[GAP]** Task description says "Updates event: rekognition_collection_id = NULL" but doesn't mention photo soft-deletion. Clarify scope.

---

### 3. Face Records Foreign Key Constraint

**Location:** `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/packages/db/src/schema/faces.ts` line 100

**Constraint:** `faces.photoId` references `photos.id` with `onDelete: "restrict"`

**Impact:** If we try to hard-delete photos (not in scope), will fail due to FK constraint

**Mitigation:** Not applicable - task only deletes Rekognition collection, not DB records

---

### 4. Queue Consumer Collection Recreation

**Location:** `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/queue/photo-consumer.ts` line 304-359

**Coupling:** Queue consumer automatically creates collection if missing

**Impact:** If photographer uploads photo to old event AFTER cleanup:
1. Queue consumer detects no collection (NULL in DB)
2. Creates new collection
3. Indexes face successfully
4. This defeats the cleanup purpose

**Mitigation:**
- Only delete collections for events where `expires_at < NOW()` (event truly expired)
- Upload endpoint already checks expiry (photos.ts line 378-384) - returns 410 Gone
- But check if uploads can bypass this (bulk upload, admin override, etc.)

**Recommendation:** Add explicit check in queue consumer - if event expired, don't recreate collection

---

## Testing Gotchas

### 1. Cannot Test Without Hitting Real AWS

**Challenge:** Rekognition DeleteCollection has no local mock

**Options:**
1. Unit test with mocked AWS SDK client (verify call made, not actual deletion)
2. Integration test with real AWS but dedicated test collection
3. Staging environment test with disposable events

**Recommendation:** Unit tests + manual staging verification

---

### 2. How to Verify 30-Day Logic Without Waiting 30 Days

**Challenge:** Need to test date calculations without time travel

**Options:**
1. Parameterize retention days (pass as env var, default 30)
2. Create test events with backdated `created_at` (if DB allows)
3. Override `NOW()` in test environment (time-mock library)

**Recommendation:** Env var `RETENTION_DAYS` (default 30, override to 0 for testing)

---

### 3. Idempotency Verification

**Challenge:** Ensure cron can run multiple times on same event safely

**Test cases:**
1. Collection already deleted (ResourceNotFoundException) - should not error
2. `rekognition_collection_id` already NULL - should skip
3. Run cron twice in same day - should not delete same event twice

**Implementation:**
- Query: `WHERE rekognition_collection_id IS NOT NULL` (skips already cleaned)
- Catch ResourceNotFoundException, treat as success
- Update DB even if AWS call fails (set NULL to prevent retry)

---

### 4. Partial Failure Scenarios

**Test cases:**
1. 10 events to clean, AWS fails on event #3 - should continue with 4-10
2. DB update fails after AWS deletion - should log and continue
3. Cron timeout after 30 seconds - should resume on next run

**Implementation:**
- Process events one-by-one, not in transaction
- Log each success/failure independently
- Don't throw errors that stop entire job

---

## Rollout Recommendations

### Phase 1: Dry-Run (Manual)
1. Deploy cron handler code WITHOUT cron trigger
2. Manually invoke via Wrangler CLI: `wrangler dev --test-scheduled`
3. Run in DRY_RUN mode - log which events would be deleted
4. Verify in staging:
   - Query results look correct (old events only)
   - Date calculations accurate
   - No active events selected

**HI approval required before Phase 2**

---

### Phase 2: Limited Rollout (Staging)
1. Enable cron in staging environment only
2. Schedule: run once per day at 3 AM UTC
3. Batch size: max 5 collections per run
4. Monitor for 1 week:
   - Check logs daily
   - Verify collections actually deleted in AWS console
   - Verify DB updated correctly
   - Check for any upload failures

**HI approval required before Phase 3**

---

### Phase 3: Production Rollout
1. Enable cron in production
2. Schedule: run daily at 3 AM UTC
3. Batch size: start with 10, increase to 50 after 1 week
4. Set up alerts:
   - >20 collections deleted in 24h (potential runaway)
   - >3 deletion failures in single run (AWS issue)
   - Cron job doesn't complete within 5 minutes (timeout)

---

### Phase 4: Steady State
1. Weekly audit: compare AWS collections vs DB records
2. Monthly cost review: verify storage costs declining
3. Quarterly review: adjust retention period if needed (30 → 60 days?)

---

## Questions for HI (if any)

### [NEED_DECISION] Retention Period
**Question:** Confirm 30-day retention for Rekognition collections?

**Context:**
- Plan says 30 days (final.md line 374-376)
- But permanent deletion is risky - no recovery
- Competitor analysis: unknown (need to research)

**Options:**
1. Keep 30 days (as planned) - saves cost, higher risk
2. Extend to 60 days - extra safety margin, 2x cost
3. Make configurable - env var `RETENTION_DAYS`

**Recommendation:** Start with 60 days, reduce to 30 after 3 months if no issues

---

### [NEED_DECISION] Soft-Delete Photos Too?
**Question:** Should cron also soft-delete photos, or only delete Rekognition collection?

**Context:**
- Task description (tasks.md line 523): "Updates event: rekognition_collection_id = NULL"
- Plan says (final.md line 371): "Photos (R2): Forever"
- Photos have `deleted_at` column (photos.ts line 35) but not used for retention

**Options:**
1. Only delete collection (task scope) - photos stay forever
2. Also soft-delete photos - mark `deleted_at` for photos of expired events
3. Hard-delete from R2 - actually remove files (irreversible)

**Current understanding:** Only delete collection, keep photos forever

**Confirmation needed?** YES - verify task scope with PM

---

### [GAP] Queue Drainage Strategy
**Question:** How to ensure no pending indexing jobs before deleting collection?

**Challenge:**
- If photo in queue when collection deleted, indexing fails
- Queue consumer will recreate collection (defeats cleanup)

**Options:**
1. Check queue depth before deletion (requires Queue API access)
2. Only delete collections for events with `uploads_closed_at` flag
3. Rely on event expiry check (upload endpoint blocks expired events)

**Current approach:** Rely on upload endpoint check (sufficient?)

---

### [GAP] Monitoring and Alerting
**Question:** What metrics should we track for cleanup job?

**Suggested metrics:**
1. Collections deleted per run (gauge)
2. Deletion failures per run (counter)
3. Cron execution time (histogram)
4. Events eligible for cleanup (gauge)
5. Total Rekognition storage cost (manual AWS billing check)

**Tools:**
- Cloudflare Analytics (basic)
- Custom logging to external service (DataDog, Sentry)
- AWS Cost Explorer for Rekognition charges

**Decision needed:** Which monitoring tool to use?

---

## Implementation Notes

### Cron Configuration (wrangler.jsonc)
```jsonc
{
  "triggers": {
    "crons": [
      "0 3 * * *"  // Daily at 3 AM UTC
    ]
  }
}
```

### Cron Handler Structure (apps/api/src/cron/cleanup.ts)
```typescript
export async function cleanupOldCollections(env: Bindings) {
  const db = createDb(env.DATABASE_URL);
  const client = createRekognitionClient(env);

  // Query events older than 30 days with collections
  const events = await db
    .select({
      id: events.id,
      collectionId: events.rekognitionCollectionId,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(
      and(
        lt(events.createdAt, sql`NOW() - INTERVAL '30 days'`),
        isNotNull(events.rekognitionCollectionId),
        lt(events.expiresAt, sql`NOW()`), // Double-check expired
      )
    )
    .limit(10); // Safety limit

  // Process each event
  for (const event of events) {
    try {
      await deleteCollection(client, event.id);
      await db
        .update(events)
        .set({ rekognitionCollectionId: null })
        .where(eq(events.id, event.id));

      console.log('[Cleanup] Deleted collection', { eventId: event.id });
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        // Already deleted, update DB anyway
        await db
          .update(events)
          .set({ rekognitionCollectionId: null })
          .where(eq(events.id, event.id));
      } else {
        console.error('[Cleanup] Failed to delete', { eventId: event.id, error });
      }
    }
  }
}
```

### Safety Checklist
- [ ] Query includes `created_at < NOW() - INTERVAL '30 days'`
- [ ] Query includes `rekognition_collection_id IS NOT NULL`
- [ ] Query includes `expires_at < NOW()` (double-check)
- [ ] Query includes `LIMIT` clause
- [ ] Handle ResourceNotFoundException (idempotent)
- [ ] Update DB even if AWS call fails
- [ ] Log each deletion attempt
- [ ] Don't use transactions (process one-by-one)
- [ ] Set batch size limit (env var or hardcoded)
- [ ] Test in dry-run mode first

---

## References
- Task spec: `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/docs/logs/BS_0001_S-1/tasks.md` line 511-533
- Execution plan: `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/docs/logs/BS_0001_S-1/plan/final.md` line 366-381
- Delete function: `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/lib/rekognition/client.ts` line 170-178
- Event schema: `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/packages/db/src/schema/events.ts`
- Photo schema: `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/packages/db/src/schema/photos.ts`
- Queue consumer: `/Users/putsuthisrisinlpa/Development/sabai/sabaipics/apps/api/src/queue/photo-consumer.ts`
