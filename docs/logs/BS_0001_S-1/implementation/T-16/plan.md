# Implementation Plan

Task: `T-16 — Photo upload API (validation + normalization + credit deduction)`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-11`
Owner: `implementv3 agent`

## Inputs

- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: T-16, lines 395-423)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-16/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-16/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-16/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-16/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-16/context/risk-scout.md`
- Research: `docs/logs/BS_0001_S-1/research/heic-rekognition.md`

## Goal / Non-goals

**Goal:**
Create `POST /events/:id/photos` endpoint that:

1. Validates file (format, size, ownership, event status)
2. Checks credit balance (≥ 1)
3. Deducts 1 credit using FIFO expiry inheritance
4. Stores image in R2
5. Creates photos DB record (status='processing')
6. Enqueues job for face detection (T-17)

**Non-goals:**

- Face detection processing (T-17)
- UI implementation (T-19)
- Rate limiting (defer to post-MVP)
- Idempotency / duplicate detection (accept duplicates for MVP)

## Approach (Data-Driven)

### File Storage Strategy `[NEED_DECISION]`

There is a conflict between the execution plan and implementation research:

**Option A: Store Original Files (Research-Backed)**

- Upload endpoint: Store original file as-is in R2 (HEIC/WebP/JPEG/PNG)
- Queue consumer (T-17): Fetch via CF Images Transform with `format=jpeg` before Rekognition
- Pros: Preserves original quality, simpler upload, faster
- Cons: Requires T-17 to implement CF Images fetching
- Evidence: `heic-rekognition.md` recommends this approach

**Option B: Normalize on Upload (Plan-Specified)**

- Upload endpoint: Transform to JPEG during upload, store normalized only
- Queue consumer (T-17): Direct fetch from R2, no transformation needed
- Pros: Simpler consumer, matches original plan
- Cons: Slower upload, more complex upload endpoint, loses original quality
- Evidence: `plan/final.md` line 45-50 specifies this

**Recommendation: Option A (Store Originals)**

Rationale:

1. Research completed after planning uncovered better approach
2. Preserves original quality for future use cases
3. Faster upload experience (no transformation latency)
4. CF Images Transform is already used for thumbnails/previews
5. T-17 will modify consumer anyway (adds face detection)

**For this plan, I will proceed with Option A unless instructed otherwise.**

### Architecture

**Route:** `POST /events/:id/photos`

**Middleware chain:**

```typescript
requirePhotographer()
  → requireConsent()
  → zValidator('param', eventParamsSchema)
  → handler
```

**Flow (12 steps):**

1. **Parse multipart form-data**
   - Extract file from body using Hono's `c.req.parseBody()`
   - Validate file exists

2. **Validate file (pre-deduction)**
   - Size: ≤ 20 MB (plan requirement)
   - Format: JPEG, PNG, HEIC, WebP only (magic bytes check)
   - Return 413 for oversized, 415 for unsupported format

3. **Load event and verify ownership**
   - Query events table
   - Check: `event.photographerId === photographer.id`
   - Check: `event.expiresAt > NOW()`
   - Return 404 for not found/unauthorized, 410 for expired

4. **Check credit balance** (within transaction)
   - Query: `SUM(amount) WHERE expires_at > NOW()`
   - If balance < 1, return 402 (insufficient credits)

5. **Deduct credit with FIFO expiry** (within transaction)
   - Query oldest unexpired purchase for `expires_at`
   - Insert credit_ledger row: `amount=-1, type='upload', expires_at=<inherited>`
   - If subquery returns NULL, abort transaction (data integrity error)

6. **Generate photo ID**
   - Let database generate UUID via `gen_random_uuid()`
   - Determine R2 key format: `{eventId}/{photoId}.{originalExt}`

7. **Stream to R2**
   - Upload file bytes to `PHOTOS_BUCKET`
   - Key: `{eventId}/{photoId}.{ext}` (preserve original extension)
   - Metadata: `{ contentType: file.type }`
   - Handle R2 errors (log, mark photo failed, no refund)

8. **Insert photos record**
   - Fields: `eventId, r2Key, status='processing', faceCount=0`
   - Return: photo ID, timestamps

9. **Enqueue job**
   - Send to `PHOTO_QUEUE`: `{ photo_id, event_id, r2_key }`
   - Handle enqueue errors (log, mark photo failed, no refund)

10. **Return success response**
    - 201 Created
    - Body: `{ data: { id, eventId, r2Key, status, uploadedAt } }`

**Error handling after credit deduction:**

- R2 upload fails → Log error, return 500, NO refund (per plan)
- Queue enqueue fails → Log error, return 500, NO refund (per plan)
- All post-deduction failures logged for manual reconciliation

### File Validation Implementation

**Magic bytes detection:**

```typescript
const MAGIC_BYTES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // 'RIFF' at start, 'WEBP' at offset 8
};
// HEIC detection is complex (multiple variants), use file-type library or accept Content-Type
```

**Size limit:** 20 MB (below CF Images 70 MB limit, Rekognition 5 MB after transform)

### Credit Deduction with Race Condition Prevention

**Transaction with row locking:**

```typescript
await db.transaction(async (tx) => {
  // 1. Lock photographer row to serialize uploads
  await tx
    .select({ id: photographers.id })
    .from(photographers)
    .where(eq(photographers.id, photographerId))
    .for('update');

  // 2. Check balance
  const [{ balance }] = await tx
    .select({ balance: sql`COALESCE(SUM(${creditLedger.amount}), 0)::int` })
    .from(creditLedger)
    .where(
      and(eq(creditLedger.photographerId, photographerId), gt(creditLedger.expiresAt, sql`NOW()`)),
    );

  if (balance < 1) {
    throw new InsufficientCreditsError();
  }

  // 3. Find FIFO expiry
  const [oldestCredit] = await tx
    .select({ expiresAt: creditLedger.expiresAt })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.photographerId, photographerId),
        gt(creditLedger.amount, 0),
        gt(creditLedger.expiresAt, sql`NOW()`),
      ),
    )
    .orderBy(asc(creditLedger.expiresAt))
    .limit(1);

  if (!oldestCredit) {
    throw new Error('No unexpired credits found despite balance check');
  }

  // 4. Deduct credit
  await tx.insert(creditLedger).values({
    photographerId,
    amount: -1,
    type: 'upload',
    expiresAt: oldestCredit.expiresAt,
    stripeSessionId: null,
  });

  // 5. Insert photo record
  const [photo] = await tx
    .insert(photos)
    .values({
      eventId,
      r2Key,
      status: 'processing',
      faceCount: 0,
    })
    .returning();

  return photo;
});
```

**Note:** This approach serializes uploads per photographer (prevents race conditions but reduces concurrency). Acceptable for MVP given typical usage patterns.

## Contracts

### API

**Endpoint:** `POST /events/:id/photos`

**Request:**

- Content-Type: `multipart/form-data`
- Body: `file` field (binary)
- Param: `id` (event UUID)

**Response (201):**

```json
{
  "data": {
    "id": "uuid",
    "eventId": "uuid",
    "r2Key": "string",
    "status": "processing",
    "faceCount": 0,
    "uploadedAt": "ISO 8601 timestamp"
  }
}
```

**Errors:**

- 400: `VALIDATION_ERROR` - Invalid request format
- 402: `INSUFFICIENT_CREDITS` - Credit balance < 1
- 404: `NOT_FOUND` - Event doesn't exist or not owned
- 410: `EVENT_EXPIRED` - Event expiration date passed
- 413: `FILE_TOO_LARGE` - File size > 20 MB
- 415: `UNSUPPORTED_FILE_TYPE` - Format not in allowed list
- 500: `UPLOAD_FAILED` - R2 or queue failure (credit NOT refunded)

### Database

**Touched tables:**

- `credit_ledger`: INSERT (deduction row)
- `photos`: INSERT (processing status)

**credit_ledger insert:**

```typescript
{
  photographerId: uuid,
  amount: -1,
  type: 'upload',
  expiresAt: <inherited from oldest purchase>,
  stripeSessionId: null
}
```

**photos insert:**

```typescript
{
  id: <db-generated uuid>,
  eventId: uuid,
  r2Key: "{eventId}/{photoId}.{ext}",
  status: "processing",
  faceCount: 0,
  uploadedAt: <now>
}
```

### R2 Storage

**Bucket:** `PHOTOS_BUCKET` binding → `sabaipics-photos` (dev/prod), `sabaipics-photos-staging` (staging)

**Key format:** `{eventId}/{photoId}.{ext}`

- Preserves original extension (`.heic`, `.jpg`, `.png`, `.webp`)
- Example: `550e8400-e29b-41d4-a716-446655440000/7c9e6679-7425-40de-944b-e07fc1f90ae7.heic`

**Metadata:** `{ contentType: <original MIME type> }`

### Queue

**Binding:** `PHOTO_QUEUE` → `photo-processing` queue

**Message payload:**

```typescript
{
  photo_id: "uuid",
  event_id: "uuid",
  r2_key: "{eventId}/{photoId}.{ext}"
}
```

**Consumer:** T-17 will implement face detection + CF Images transformation

## Success Path

1. Photographer uploads 5 MB HEIC file
2. API validates: format (HEIC ✓), size (5 MB ✓), event ownership (✓), expiration (✓)
3. Credit check: balance = 10 ✓
4. Transaction: Deduct 1 credit (balance → 9), insert photo row
5. R2 upload: Store original HEIC at `{eventId}/{photoId}.heic`
6. Queue enqueue: Send job with photo metadata
7. Response: 201 Created with photo data
8. Consumer (T-17): Fetch via CF Images (HEIC→JPEG), call Rekognition, update status

## Failure Modes / Edge Cases (Major Only)

### Pre-Credit-Deduction Failures (Safe)

1. **Invalid format** → 415 error, no credit deducted
2. **File too large** → 413 error, no credit deducted
3. **Event not found** → 404 error, no credit deducted
4. **Event expired** → 410 error, no credit deducted
5. **Insufficient credits** → 402 error, no transaction attempted

### Post-Credit-Deduction Failures (No Refund)

6. **R2 upload fails** → Credit deducted, photo row exists (status='processing'), return 500, log for manual refund
7. **Queue enqueue fails** → Credit deducted, photo in R2, row exists, return 500, log for manual refund

### Race Conditions (Mitigated)

8. **Concurrent uploads** → Photographer row lock serializes transactions, prevents negative balance

### Data Integrity

9. **FIFO expiry NULL** → Transaction aborts if no unexpired credits found, prevents constraint violation

## Validation Plan

### Tests to Add

**Unit tests** (`apps/api/src/routes/events/upload.test.ts`):

1. Auth: Returns 401 without authentication
2. Ownership: Returns 404 for non-owned event
3. Expired event: Returns 410 for expired event
4. File validation: Returns 413 for 21 MB file
5. File validation: Returns 415 for unsupported format (e.g., .pdf)
6. Credit check: Returns 402 when balance < 1
7. Success: Returns 201 with photo data for valid upload
8. R2 failure: Returns 500, logs error (mock R2 to throw)
9. Queue failure: Returns 500, logs error (mock queue to throw)

**Integration tests:**

1. Full flow: Upload → credit deduction → R2 → DB → queue
2. Race condition: Two concurrent uploads don't create negative balance (mock DB transaction)
3. FIFO expiry: Credit deduction inherits correct expiry date

**Manual testing:**

1. Upload JPEG from desktop
2. Upload PNG with transparency
3. Upload HEIC from iPhone
4. Upload WebP
5. Upload 19.9 MB file (at limit)
6. Upload 20.1 MB file (rejected)
7. Concurrent uploads from same photographer

### Commands to Run

```bash
# Run unit tests
pnpm --filter=@sabaipics/api test

# Run type checking
pnpm --filter=@sabaipics/api typecheck

# Run linter
pnpm --filter=@sabaipics/api lint

# Test locally with wrangler dev
pnpm --filter=@sabaipics/api dev
# Then use curl or Postman to test upload endpoint
```

## Rollout / Rollback

### Rollout Strategy

1. Deploy to staging environment (auto-deploy from master)
2. Test with real HEIC files from iPhone
3. Monitor logs for credit deduction errors
4. Deploy to production with manual approval
5. Monitor upload success rate (target: >95%)

### Monitoring

- Log all credit deductions with before/after balance
- Log all post-deduction failures (require manual review)
- Track upload success rate by format (JPEG, PNG, HEIC, WebP)
- Alert on credit balance anomalies (negative balance, NULL expiry)

### Rollback Plan

- If critical issues: revert PR, return 503 from upload endpoint
- Credits already deducted: NOT rolled back (manual refunds if needed)
- Photos in R2: Remain (cleanup job not in scope)
- Photos in DB: Remain with status='processing' or 'failed'

## Open Questions

### Blocking Decisions

**1. `[NEED_DECISION]` File Storage Strategy**

- **Option A (Recommended):** Store original files, transform in consumer (T-17)
- **Option B:** Transform on upload, store JPEG only
- **Impact:** Affects T-16 scope, T-17 implementation, and original quality preservation
- **Awaiting:** HI confirmation on which approach to use

### Non-Blocking (Can Proceed with Defaults)

**2. `[NEED_VALIDATION]` Rate Limiting**

- Current plan: No rate limiting for MVP
- Default: Proceed without rate limiting, defer to post-MVP
- Risk: Abuse possible, but mitigated by credit system

**3. `[NEED_VALIDATION]` Event Expiration Date**

- Should expired events allow uploads?
- Default: Reject uploads to expired events (410 Gone)
- Assumption: Event expiration is a hard cutoff

**4. `[NEED_VALIDATION]` PDPA Consent for Upload**

- Should upload require PDPA consent, or only credit purchase?
- Default: Require consent (use `requireConsent()` middleware)
- Assumption: Uploading photos with faces is PDPA-relevant activity

## Key Files to Modify

### Create New Files

- `apps/api/src/routes/events/upload.ts` - Upload route handler (or add to existing `index.ts`)
- `apps/api/src/routes/events/upload.test.ts` - Unit tests

### Modify Existing Files

- `apps/api/src/routes/events/index.ts` - Add upload route to router
- `apps/api/src/routes/events/schema.ts` - Add upload validation schema

## Dependencies Verified

**Upstream (Complete):**

- T-1: Database schema ✓ (photos, credit_ledger tables exist)
- T-2: Auth middleware ✓ (requirePhotographer, requireConsent)
- T-13: Events API ✓ (event ownership validation pattern)

**Downstream (Blocked on T-16):**

- T-17: Queue consumer (will add face detection + CF Images fetching)
- T-19: Upload UI (will call this endpoint)

**External Services:**

- R2: `PHOTOS_BUCKET` binding configured in wrangler.jsonc ✓
- Queue: `PHOTO_QUEUE` binding configured in wrangler.jsonc ✓
- CF Images: Required for T-17 (consumer transformation), not T-16 ✓

## Risk Mitigation Summary

| Risk                   | Mitigation                             | Status              |
| ---------------------- | -------------------------------------- | ------------------- |
| Credit race condition  | Transaction with row lock              | Implemented in plan |
| FIFO expiry NULL       | Explicit NULL check, abort transaction | Implemented in plan |
| R2 upload failure      | Log error, no refund, return 500       | Implemented in plan |
| Queue enqueue failure  | Log error, no refund, return 500       | Implemented in plan |
| Magic bytes bypass     | Secondary MIME type check              | Implemented in plan |
| File size spoofing     | Server-side size validation            | Implemented in plan |
| Event ownership bypass | DB query with photographer ID filter   | Implemented in plan |
| Expired event uploads  | Check `expiresAt` before deduction     | Implemented in plan |

## Implementation Checklist

**Pre-implementation:**

- [x] Context gathered (upstream, logs, tech docs, exemplars, risks)
- [ ] HI decision on storage strategy (Option A vs B)
- [ ] HI approval of this plan

**Implementation:**

- [ ] Add upload schema to `events/schema.ts`
- [ ] Implement credit balance check function
- [ ] Implement FIFO credit deduction with row lock
- [ ] Implement file validation (magic bytes + size)
- [ ] Implement event ownership + expiration check
- [ ] Implement R2 upload with error handling
- [ ] Implement queue enqueue with error handling
- [ ] Implement upload route handler
- [ ] Add route to events router
- [ ] Write unit tests (9 test cases)
- [ ] Write integration tests (3 test cases)

**Validation:**

- [ ] Run unit tests (all pass)
- [ ] Run type checking (no errors)
- [ ] Run linter (no errors)
- [ ] Manual test: JPEG, PNG, HEIC, WebP uploads
- [ ] Manual test: File size limits
- [ ] Manual test: Concurrent uploads

**Deployment:**

- [ ] Commit code with conventional message
- [ ] Open PR with implementation summary
- [ ] Deploy to staging
- [ ] Test with real iPhone HEIC files
- [ ] Monitor credit deductions
- [ ] Deploy to production (manual approval)

## Summary

T-16 implements the critical photo upload flow that bridges authentication, credit management, file storage, and asynchronous processing. The primary technical challenges are:

1. **Credit deduction atomicity** - Mitigated with transaction + row locking
2. **File format validation** - Magic bytes + MIME type checks
3. **Error handling post-deduction** - No refunds, comprehensive logging

**Key decision required:** Storage strategy (store originals vs normalize on upload). Recommendation is to store originals for quality preservation and simpler upload flow, deferring transformation to T-17.

**Status:** Ready for HI decision on storage strategy, then ready for implementation.
