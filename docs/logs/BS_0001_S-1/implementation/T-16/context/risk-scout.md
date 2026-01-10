# Risk Scout: T-16 Photo Upload API

**Root ID:** BS_0001_S-1
**Task:** T-16 - Photo upload API (validation + normalization + credit deduction)
**Date:** 2026-01-11
**Status:** Pre-implementation analysis

---

## Executive Summary

T-16 is a **HIGH RISK** task that combines financial transactions (credit deduction), file handling, external service integration (Cloudflare Images), and asynchronous processing (queue). This is a critical path feature that directly impacts revenue and user experience.

**Primary risk areas:**
1. Credit deduction atomicity (FIFO expiry, race conditions)
2. File upload validation (size, format, malicious content)
3. Image normalization failures and partial uploads
4. R2 upload failures leaving orphaned data
5. Queue reliability and job enqueueing
6. Authentication/authorization boundaries
7. Rate limiting and abuse prevention

**Critical finding:** Current upload endpoint does NOT exist yet. Gallery API (T-18) has been implemented but shows only the read path. The upload flow including credit deduction must be built from scratch.

---

## 1. Credit Deduction Risks (CRITICAL)

### 1.1 FIFO Expiry Inheritance

**Risk:** Credit deduction must inherit expiry from oldest unexpired purchase. Incorrect implementation could:
- Allow usage of expired credits
- Deduct from wrong expiry bucket
- Create negative balance after purchases expire

**Evidence from `plan/final.md`:**
```sql
-- Deduction insert (FIFO expiry)
INSERT INTO credit_ledger (photographer_id, amount, type, expires_at)
VALUES (
  :photographer_id,
  -1,
  'upload',
  (SELECT expires_at FROM credit_ledger
   WHERE photographer_id = :photographer_id
     AND amount > 0
     AND expires_at > NOW()
   ORDER BY expires_at ASC
   LIMIT 1)
);
```

**[COUPLING]** This pattern couples the upload endpoint to the credit ledger FIFO semantics. Any change to expiry model requires updating both credit purchase (T-10) and upload (T-16).

**[RISK]** What happens if no unexpired credits exist but balance check passed due to race condition? The subquery returns NULL, violating NOT NULL constraint on `expires_at`.

**Mitigation required:**
1. Wrap balance check + deduction in database transaction
2. Add explicit validation that subquery returns non-NULL
3. Consider adding a `balance_after` column for faster reconciliation (mentioned in deprecated schema but not in current implementation)

### 1.2 Race Conditions in Balance Check

**Risk:** Two concurrent uploads could both pass the balance check before either deducts, resulting in negative balance.

**Attack vector:**
```
Time  Upload A                Upload B
T0    SELECT SUM() = 5 ✓      
T1                            SELECT SUM() = 5 ✓
T2    INSERT -1 (balance=4)   
T3                            INSERT -1 (balance=3)
```

**Mitigation options:**

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| A) Row-level lock (SELECT FOR UPDATE) | Prevents race | Reduces concurrency | Recommended |
| B) Optimistic locking (version column) | Better concurrency | Complex retry logic | Not needed for MVP |
| C) Serializable transaction | Simplest code | Lowest throughput | Too conservative |

**[RISK]** Cloudflare D1 (Postgres via Hyperdrive) transaction isolation level needs verification. Default is typically READ COMMITTED, which allows phantom reads.

**Recommended implementation:**
```typescript
await db.transaction(async (tx) => {
  // Lock photographer row to serialize concurrent uploads
  const [photographer] = await tx
    .select({ id: photographers.id })
    .from(photographers)
    .where(eq(photographers.id, photographerId))
    .for('update');
  
  // Check balance
  const balance = await calculateBalance(tx, photographerId);
  if (balance < 1) {
    throw new InsufficientCreditsError();
  }
  
  // Find FIFO expiry
  const [oldestCredit] = await tx
    .select({ expiresAt: creditLedger.expiresAt })
    .from(creditLedger)
    .where(and(
      eq(creditLedger.photographerId, photographerId),
      eq(creditLedger.type, 'purchase'),
      gt(creditLedger.expiresAt, sql`NOW()`)
    ))
    .orderBy(asc(creditLedger.expiresAt))
    .limit(1);
    
  if (!oldestCredit) {
    throw new Error('No unexpired credits found despite balance check');
  }
  
  // Deduct credit
  await tx.insert(creditLedger).values({
    photographerId,
    amount: -1,
    type: 'upload',
    expiresAt: oldestCredit.expiresAt,
  });
});
```

**[HI_GATE]** Should we implement photographer row locking (serializes all uploads for a photographer) or accept potential race conditions and reconcile manually?

### 1.3 Refund Policy on Upload Failures

**Risk:** Credit is deducted immediately after validation. If subsequent operations fail (normalization, R2 upload, queue enqueue), the credit is lost but no photo is processed.

**Evidence from `plan/final.md`:**
> "Done (no refund on any failure after deduction)"

**[HI_GATE]** This is a business decision documented in the plan, but implementation must be clear:
- Credit deducted = point of no return
- All failures after deduction are logged but NOT refunded
- Manual reconciliation process needed for systemic failures

**Mitigation:**
1. Log all failures after deduction with photographerId, amount, timestamp, error
2. Create manual refund process for support team
3. Monitor refund requests to identify systematic issues

**[RISK]** No alerting mechanism exists for post-deduction failures. Consider Sentry integration.

---

## 2. File Upload Validation Risks

### 2.1 Size Limit Enforcement

**Evidence from research (`cf-upload-limits.md`):**
- Cloudflare Workers request body limit: 100 MB (Free/Pro), 200 MB (Business), 500 MB (Enterprise)
- Cloudflare Images input limit: **70 MB**
- Recommended limit: **20 MB** (per plan, line 395 in tasks.md)

**Current state:** No upload endpoint exists yet, so no validation implemented.

**[RISK]** 20 MB limit is below CF Images' 70 MB limit (good) but enforcing it requires:
1. Client-side pre-flight check (can be bypassed)
2. Server-side validation before accepting body
3. Streaming body parser that rejects early if size exceeded

**Hono implementation pattern:**
```typescript
app.post('/events/:id/photos', 
  bodyLimit({ maxSize: 20 * 1024 * 1024 }), // Hono middleware
  requirePhotographer(),
  async (c) => {
    // ...
  }
);
```

**[GAP]** Hono `bodyLimit` middleware needs verification - does it work with multipart uploads?

### 2.2 Format Validation

**Evidence from plan:**
- Accepted: JPEG, PNG, HEIC, WebP
- Rejected: RAW (CR2, NEF, ARW)
- Max size: 20 MB

**Validation layers:**

| Layer | Check | Bypass Risk | Enforcement |
|-------|-------|-------------|-------------|
| Client-side | File extension + size | High (JS disabled, modified) | UX convenience only |
| Server MIME type | Content-Type header | High (trivially spoofed) | Secondary check |
| Magic bytes | Read first 12 bytes of file | Low (requires valid file header) | **Primary enforcement** |

**Magic bytes for supported formats:**
```typescript
const MAGIC_BYTES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // 'RIFF'
  'image/heic': [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], // 'ftypheic'
};
```

**[RISK]** HEIC detection is complex (multiple variants: heic, heix, hevc, hevx). Consider using a library like `file-type` (works in CF Workers).

**[SECURITY]** Malicious uploads:
- SVG with embedded JavaScript (not in accepted formats, but validate to be sure)
- JPEG with embedded exploits (polyglot files)
- Zip bombs disguised as images

**Mitigation:** Cloudflare Images transformation acts as sanitization layer - it decodes and re-encodes, stripping metadata and malicious payloads.

### 2.3 Image Dimensions and Megapixel Limit

**Evidence from research:**
- Cloudflare Images max area: **100 megapixels** (e.g., 10,000 x 10,000 px)
- Rekognition max dimension: **4096 px per side** (from AWS docs)

**[RISK]** A valid 20 MB JPEG could be 20,000 x 10,000 px (200 megapixels), exceeding CF Images limit and Rekognition limit.

**Mitigation:**
1. Cloudflare Images will reject during transformation (returns error)
2. Handle transform errors gracefully
3. Document dimension limits in user-facing error messages

**[GAP]** Should we pre-validate dimensions before deducting credit, or accept that extremely large images fail after deduction?

**Recommendation:** Accept after-deduction failures for simplicity. Photographers uploading 100+ megapixel images are edge cases.

---

## 3. Image Normalization Risks

### 3.1 Cloudflare Images Transformation Approach

**Evidence from research (`heic-rekognition.md`):**
- Option A (recommended): Cloudflare Images Transform via fetch with `cf.image` parameters
- Stores original in R2, transforms on-demand for Rekognition
- Handles HEIC → JPEG conversion automatically

**Current implementation in `photos.ts` (gallery API):**
```typescript
function generateThumbnailUrl(r2Key: string, cfDomain: string, r2BaseUrl: string): string {
  return `${cfDomain}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${r2BaseUrl}/${r2Key}`;
}
```

**[COUPLING]** Upload flow must store in R2 first, then queue consumer fetches via CF Images transform URL for Rekognition. Two separate operations:

```
Upload flow:           Store original → R2 → Enqueue job
Queue consumer flow:   Fetch via CF Images → Transform to JPEG → Rekognition
```

**[RISK]** If CF Images is unavailable during queue processing, face detection fails. No retry mechanism defined in plan.

**Mitigation (from `photo-consumer.ts`):**
- Existing queue consumer already handles retries (max 3 attempts)
- Non-retryable errors ack immediately
- Retryable errors use exponential backoff

**[GAP]** CF Images errors are not classified in the existing error handling. Need to add CF Images error codes to `isRetryableError()` logic.

### 3.2 Normalization Parameters

**Evidence from plan:**
> "Normalize to JPEG (4000px max, quality 90%) via CF Images"

**CF Images transform parameters:**
```typescript
{
  format: "jpeg",
  quality: 90,
  fit: "scale-down",  // Preserve aspect ratio
  width: 4000,
  height: 4000,       // Max dimension, not forced
}
```

**[RISK]** `fit: "scale-down"` vs `fit: "contain"` vs `fit: "cover"`:
- `scale-down`: Only downscale if larger (recommended)
- `contain`: Always fit within bounds (may upscale small images)
- `cover`: Fill bounds (crops image)

**Recommendation:** Use `scale-down` to preserve original dimensions for images < 4000px.

### 3.3 Partial Upload Failures

**Risk scenario:**
1. Client uploads 15 MB JPEG
2. Server accepts, deducts credit
3. Cloudflare Images transform fails (500 error)
4. Original file not stored in R2 yet

**Result:** Credit deducted, no photo.

**Mitigation:** Change operation order:
```
1. Validate format/size (no credit deduction yet)
2. Deduct credit (point of no return)
3. Stream to R2 directly (no local buffering)
4. Insert photos row (status='processing')
5. Enqueue job for normalization + Rekognition
```

**[RISK]** Streaming directly to R2 means we can't do complex validation (e.g., image dimensions) without buffering in memory.

**[HI_GATE]** Accept that complex validation happens after credit deduction, or buffer entire file in memory (risks exceeding 128 MB Worker memory limit)?

**Recommendation:** Stream to R2 immediately, accept dimension validation happens in queue consumer.

---

## 4. R2 Upload Risks

### 4.1 Partial Uploads and Multipart

**Evidence from research:**
- Single PUT upload max: **5 GiB**
- Our files: max 20 MB

**Conclusion:** Single PUT is sufficient, no multipart upload needed.

**[PERF]** Workers have 30s CPU time limit. Uploading 20 MB over slow connection could approach this limit.

**Mitigation:**
- Use streaming upload via R2 binding (`env.PHOTOS_BUCKET.put(key, stream)`)
- Streaming doesn't count towards CPU time (network I/O is separate)

### 4.2 R2 Key Generation and Collisions

**Current implementation (absent - needs to be created):**

**Recommended pattern:**
```typescript
const r2Key = `events/${eventId}/photos/${photoId}.jpg`;
// photoId is UUID from database insert
```

**[RISK]** If R2 upload fails after DB insert, orphaned DB row exists.

**Mitigation:**
1. Insert photos row with `status='processing'`
2. Upload to R2
3. If upload fails, row remains with `status='processing'` (valid - indicates upload failed)
4. Add cleanup job to delete failed uploads after 24 hours

**[GAP]** No cleanup job defined in current plan (T-20 handles Rekognition cleanup, not failed uploads).

### 4.3 R2 Availability and Durability

**Evidence:** Cloudflare R2 has 99.9% uptime SLA (standard for object storage).

**[RISK]** R2 service degradation during event upload session affects photographer experience.

**Mitigation:**
- Retry R2 upload failures (exponential backoff)
- Show clear error to user: "Upload service temporarily unavailable"
- Consider enqueueing to DLQ for manual retry if all retries fail

**[PERF]** R2 PUT latency:
- Typical: 50-200ms
- 95th percentile: 500ms
- 99th percentile: 1-2s

**Impact:** Uploading 50 photos sequentially = 10-100 seconds. Need parallel uploads in UI.

---

## 5. Queue Reliability Risks

### 5.1 Job Enqueueing Failures

**Current queue config (`wrangler.jsonc`):**
```json
"producers": [
  {
    "queue": "photo-processing",
    "binding": "PHOTO_QUEUE"
  }
],
```

**[RISK]** If `PHOTO_QUEUE.send()` fails after R2 upload and DB insert, photo remains in `status='processing'` forever.

**Mitigation:**
1. Wrap enqueue in try-catch
2. If enqueue fails, update photos row to `status='failed'`
3. Log error for manual retry
4. Optionally: retry enqueue with exponential backoff

**[GAP]** Current photo-consumer.ts assumes jobs arrive in queue. No code handles failed enqueue.

**Recommended error handling:**
```typescript
try {
  await c.env.PHOTO_QUEUE.send({
    photo_id: photoId,
    event_id: eventId,
    r2_key: r2Key,
  });
} catch (err) {
  // Update photo status to failed
  await db.update(photos)
    .set({ status: 'failed' })
    .where(eq(photos.id, photoId));
  
  // Log for manual investigation
  console.error(`Failed to enqueue photo ${photoId}:`, err);
  
  // Return 500 to client? Or 202 with warning?
  throw new Error('Failed to enqueue photo for processing');
}
```

**[HI_GATE]** Should we return 500 to client if enqueue fails (credits already deducted), or return 202 and mark as failed in DB?

### 5.2 Queue Consumer Failures

**Evidence from `photo-consumer.ts`:**
- Max retries: 3
- Exponential backoff for retryable errors
- DLQ for failed messages after max retries

**[RISK]** Photos in DLQ are invisible to photographer. No notification or recovery mechanism.

**Mitigation (out of scope for T-16, but document):**
1. Create DLQ monitoring alert
2. Manual retry process from DLQ
3. Consider refund policy for DLQ photos

### 5.3 Rekognition Collection Lazy Creation

**Evidence from plan:**
```
3 | Queue | **If NULL:** Create collection, save ID
```

**[COUPLING]** First photo upload for an event triggers Rekognition collection creation. This operation can fail.

**Error scenarios:**
1. Rekognition `CreateCollection` fails (rate limit, AWS credentials issue)
2. Collection created but DB update fails (eventId wrong, DB connection lost)
3. Concurrent first uploads both try to create collection

**Mitigation:**
- Existing `rekognition-collection-id.ts` handles create + update atomically (needs verification)
- Race condition: second upload sees NULL, tries to create, gets AlreadyExists error → should be idempotent

**[RISK]** Current `photo-consumer.ts` has placeholder comment but no implementation:
```typescript
// TODO: Application layer will handle DB writes here
```

**[GAP]** Collection creation + face DB persistence not implemented yet (will be T-17).

---

## 6. Authentication & Authorization Risks

### 6.1 Event Ownership Validation

**Risk:** Photographer A uploads photo to Photographer B's event.

**Existing pattern from `photos.ts` (gallery API):**
```typescript
// CRITICAL: Verify event ownership BEFORE querying photos
const [event] = await db
  .select({ id: events.id })
  .from(events)
  .where(and(
    eq(events.id, eventId),
    eq(events.photographerId, photographer.id)
  ))
  .limit(1);

if (!event) {
  return c.json(notFoundError('Event not found'), 404);
}
```

**[COUPLING]** Upload endpoint must replicate this pattern. Consider extracting to middleware.

**Recommendation:**
```typescript
// New middleware: requireEventOwnership(eventId)
export function requireEventOwnership(eventIdParam: string = 'eventId'): MiddlewareHandler<Env> {
  return async (c, next) => {
    const eventId = c.req.param(eventIdParam);
    const photographer = c.var.photographer;
    const db = c.var.db();
    
    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(
        eq(events.id, eventId),
        eq(events.photographerId, photographer.id)
      ))
      .limit(1);
    
    if (!event) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
    }
    
    c.set('event', event);
    return next();
  };
}
```

### 6.2 PDPA Consent Check

**Current implementation:** `requireConsent()` middleware exists (used in credits.ts).

**[RISK]** Should photo upload require PDPA consent, or is auth sufficient?

**Evidence from T-5 (consent API):**
> "Updates `photographers.pdpa_consent_at`"

**[HI_GATE]** Is PDPA consent required for photo upload, or only for credit purchase? Legal compliance question.

**Recommendation:** Apply `requireConsent()` middleware to upload endpoint to be safe.

### 6.3 Event Expiration Check

**Evidence from schema (`events.ts`):**
```typescript
expiresAt: timestamptz("expires_at").notNull(),
```

**Risk:** Photographer uploads photos to expired event.

**[RISK]** No expiration validation in existing gallery API (`photos.ts`).

**Mitigation:** Add expiration check:
```typescript
if (new Date(event.expiresAt) < new Date()) {
  return c.json({
    error: {
      code: 'EVENT_EXPIRED',
      message: 'This event has expired. No new uploads allowed.'
    }
  }, 410); // 410 Gone
}
```

---

## 7. Rate Limiting & Abuse Risks

### 7.1 No Rate Limiting Implemented

**Current state:** No rate limiting middleware exists in codebase.

**Attack vectors:**
1. Photographer uploads 1000 photos rapidly, exhausting credits
2. Malicious actor spams upload endpoint (DDoS)
3. Accidental mass upload from buggy client

**[RISK]** Without rate limiting, abuse is trivial.

**Mitigation options:**

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| A) Cloudflare Rate Limiting (WAF) | No code changes | Costs extra | Enable if budget allows |
| B) Durable Object rate limiter | Centralized state | Adds latency | Overkill for upload (use for search) |
| C) Simple per-photographer limit | Easy to implement | Requires state (KV or DB) | Good MVP option |

**Recommended MVP implementation:**
```typescript
// Check: max 100 uploads per photographer per hour
const recentUploads = await db
  .select({ count: sql`count(*)` })
  .from(photos)
  .where(and(
    eq(photos.eventId, eventId),
    gt(photos.uploadedAt, sql`NOW() - INTERVAL '1 hour'`)
  ));

if (recentUploads[0].count >= 100) {
  return c.json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Maximum 100 uploads per hour. Please try again later.'
    }
  }, 429);
}
```

**[HI_GATE]** What is the acceptable upload rate limit? 100/hour? 1000/day?

### 7.2 Credit Exhaustion Attacks

**Risk:** Photographer with valid account uploads junk photos to exhaust credits, then requests refund.

**Mitigation:**
- No refund policy (documented in plan)
- Monitor for suspicious upload patterns (all uploads fail face detection)
- Consider manual review for large refund requests

---

## 8. Performance Risks

### 8.1 Sequential Processing Bottleneck

**Flow:**
```
1. Validate (fast)
2. Check balance (DB query)
3. Deduct credit (DB insert, requires finding FIFO expiry)
4. Upload to R2 (network I/O)
5. Insert photos row (DB insert)
6. Enqueue job (queue send)
```

**[PERF]** Steps 2-6 are sequential. For 50 photos:
- Balance check: 50 * 20ms = 1s
- Deduct: 50 * 30ms = 1.5s (includes FIFO subquery)
- R2 upload: 50 * 200ms = 10s
- DB insert: 50 * 20ms = 1s
- Enqueue: 50 * 10ms = 0.5s
- **Total: 14 seconds minimum**

**Mitigation:**
- Client-side: parallel uploads (limit to 5 concurrent)
- Server-side: batch credit deductions? (complex, not recommended for MVP)

**[PERF]** Alternative: single-page batch upload endpoint that deducts credits once and accepts multiple files. Adds complexity.

### 8.2 Memory Usage for Large Files

**Risk:** Buffering 20 MB file in Worker memory exceeds 128 MB limit.

**Mitigation:** Use streaming upload:
```typescript
const file = await c.req.blob(); // Streaming blob
await env.PHOTOS_BUCKET.put(r2Key, file.stream());
```

**[GAP]** Verify that Hono + R2 bindings support streaming uploads without buffering.

---

## 9. Sensitive Data & Security

### 9.1 PII in Photos

**Risk:** Photos contain faces (PII under PDPA). Rekognition response contains bounding boxes and landmarks.

**Current handling:**
- Rekognition response stored in `faces.rekognition_response` JSONB column
- No encryption at rest (Postgres doesn't encrypt by default)

**[SECURITY]** PDPA compliance question: Is storing face bounding boxes considered sensitive data?

**Recommendation:** Consult legal. If yes:
1. Encrypt `rekognition_response` column at application layer
2. Add data retention policy (already planned: 30 days for Rekognition collection, forever for photos DB)

### 9.2 Logging Sensitive Data

**Risk:** Logging photo content or photographer details in error messages.

**Mitigation:**
- Log photo IDs, not content
- Redact photographer email/name in logs
- Use Sentry breadcrumbs for debugging without exposing PII

**Example safe logging:**
```typescript
console.log(`Upload failed for photo ${photoId} by photographer ${photographerId}`);
// DON'T: console.log(`Upload failed for ${photographer.email}`);
```

### 9.3 R2 Bucket Permissions

**Current config (`wrangler.jsonc`):**
```json
"r2_buckets": [
  {
    "binding": "PHOTOS_BUCKET",
    "bucket_name": "sabaipics-photos"
  }
]
```

**[SECURITY]** R2 bucket binding gives Worker full read/write access. No object-level permissions.

**Risk:** Worker compromise exposes all photos.

**Mitigation:**
- Keep Workers code secure (no eval, no dynamic imports)
- Use Cloudflare Access for admin endpoints
- Monitor R2 API logs for unusual access patterns

---

## 10. Human-in-Loop Gates

### [HI_GATE] 10.1 Credit Deduction Timing

**Question:** Should credit be deducted:
- A) After validation but before R2 upload (as planned)
- B) After successful R2 upload (safer, but complex rollback if queue enqueue fails)
- C) After queue enqueue succeeds (safest, but photographer sees delay)

**Current plan:** Option A (after validation, no refund on failures).

**Implications:**
- Option A: Photographer loses credit on upload failures (R2, queue issues)
- Option B: Complex rollback logic, potential for credit/photo mismatch
- Option C: Better UX, but queue reliability becomes critical

**Recommendation:** Stick with Option A (as planned) with excellent error logging.

### [HI_GATE] 10.2 Rate Limiting Thresholds

**Question:** What upload rate limits are acceptable?
- Max uploads per hour per photographer?
- Max uploads per event per day?
- Max file size per upload?

**Recommended starting point:**
- 100 uploads per hour per photographer
- 1000 uploads per event per day
- 20 MB per file (as planned)

### [HI_GATE] 10.3 PDPA Consent for Upload

**Question:** Is PDPA consent required for uploading photos, or only for purchasing credits?

**Impact:** Determines if `requireConsent()` middleware is needed.

**Recommendation:** Apply `requireConsent()` to upload endpoint for legal safety.

### [HI_GATE] 10.4 Handling Failed Uploads Post-Deduction

**Question:** How should we handle photos that fail after credit deduction?
- A) Manual refund process (as planned)
- B) Automatic refund after N hours if status='failed'
- C) No refunds, photographer notified to retry

**Current plan:** Option A (manual, no automatic refunds).

**Recommendation:** Document manual refund process for support team.

---

## 11. Gaps & Unknowns

### [GAP] 11.1 Upload Endpoint Not Implemented

**Current state:** `apps/api/src/routes/photos.ts` only has GET (gallery). POST does not exist.

**Missing components:**
1. Multipart form-data parsing
2. File validation (size, format, magic bytes)
3. Credit balance check + deduction transaction
4. R2 streaming upload
5. DB insert (photos row)
6. Queue job enqueue
7. Error handling for all failure modes

**Estimated complexity:** High (8-12 hours implementation + testing).

### [GAP] 11.2 Cloudflare Images Error Handling

**Issue:** Photo-consumer.ts classifies Rekognition errors but not CF Images errors.

**Action needed:** Add CF Images error codes to `isRetryableError()`:
```typescript
// Add to existing rekognition/errors.ts
export function isCFImagesRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('503') || message.includes('timeout');
}
```

### [GAP] 11.3 Failed Upload Cleanup Job

**Issue:** Photos that fail upload (status='processing' forever) have no cleanup mechanism.

**Action needed:** Create cron job (similar to T-20) to:
1. Find photos with `status='processing'` older than 24 hours
2. Update to `status='failed'`
3. Log for investigation

**Not in current plan - consider as T-21.**

### [GAP] 11.4 DLQ Monitoring

**Issue:** Photos that fail all retries go to DLQ and become invisible.

**Action needed:**
1. Alert on DLQ size > threshold
2. Manual retry process from DLQ
3. Consider credit refund for DLQ photos

**Not in current plan - operational concern.**

### [GAP] 11.5 Transaction Isolation Level Verification

**Issue:** Unknown if Neon/Hyperdrive supports SELECT FOR UPDATE and proper transaction isolation.

**Action needed:** Test transaction behavior:
```typescript
await db.transaction(async (tx) => {
  const [row] = await tx
    .select()
    .from(photographers)
    .where(eq(photographers.id, id))
    .for('update'); // Does this work?
});
```

---

## 12. Merge Conflict Hotspots

### 12.1 `apps/api/src/routes/photos.ts`

**Risk Level:** HIGH

**Current state:** Only GET endpoint exists.

**T-16 changes:** Add POST endpoint for upload.

**Conflict potential:** Low (no parallel work on this file expected).

**Mitigation:** Complete T-16 as single PR.

### 12.2 `packages/db/src/schema/credit-ledger.ts`

**Risk Level:** MEDIUM

**T-10 changes:** Added unique constraint on `stripe_session_id` (per T-10 risk scout).

**T-16 changes:** None (read-only usage).

**Conflict potential:** Low.

### 12.3 `apps/api/src/queue/photo-consumer.ts`

**Risk Level:** LOW

**T-16 changes:** None (T-16 only enqueues, doesn't consume).

**T-17 changes:** Add face DB persistence (parallel work).

**Mitigation:** T-17 depends on T-16 in task graph, so no conflict.

---

## 13. Test Coverage Requirements

### 13.1 Unit Tests (Required)

**Credit deduction:**
1. Balance check prevents insufficient credits
2. FIFO expiry inheritance selects oldest expiry
3. Race condition: concurrent uploads don't create negative balance

**Validation:**
1. File size > 20 MB rejected with 413
2. Unsupported format rejected with 415
3. Magic bytes detection catches spoofed MIME types
4. Expired event rejected with 410

**Error handling:**
1. R2 upload failure marks photo as failed
2. Queue enqueue failure marks photo as failed
3. Deduction succeeds even if queue fails (no rollback)

### 13.2 Integration Tests (Required)

**Full upload flow:**
1. Valid upload: validate → deduct → R2 → DB → queue
2. Insufficient credits: balance check fails, no deduction
3. Invalid format: validation fails, no deduction
4. R2 failure: credit deducted, photo marked failed

**Concurrent uploads:**
1. Two uploads at same time don't create race condition
2. Balance check + deduction are atomic

### 13.3 Manual Testing

**File types:**
1. JPEG (various sizes)
2. PNG (transparency)
3. HEIC (from iPhone)
4. WebP (animated and static)
5. RAW (should reject)

**Edge cases:**
1. 20 MB file (at limit)
2. 20.1 MB file (rejected)
3. 10,000 x 10,000 px image (100 megapixels, at limit)
4. Corrupted file (magic bytes check fails)

**Error scenarios:**
1. R2 unavailable (mock)
2. Queue unavailable (mock)
3. Database timeout (mock)

---

## 14. Implementation Checklist

**Prerequisites:**
- [ ] Verify T-13 (Events API) is complete
- [ ] Verify T-10 (Stripe webhook) is complete (credit_ledger working)
- [ ] Verify T-2 (requirePhotographer middleware) is complete

**Credit deduction logic:**
- [ ] Implement FIFO expiry selection query
- [ ] Wrap balance check + deduction in transaction
- [ ] Add photographer row lock to prevent race conditions
- [ ] Validate expires_at is not NULL from subquery
- [ ] Test concurrent upload race condition

**File validation:**
- [ ] Add bodyLimit middleware (20 MB)
- [ ] Implement magic bytes format detection
- [ ] Validate file size before deduction
- [ ] Reject unsupported formats with clear error

**Upload flow:**
- [ ] Parse multipart form-data
- [ ] Stream to R2 (no buffering)
- [ ] Generate unique R2 key (event/photo UUID)
- [ ] Insert photos row (status='processing')
- [ ] Enqueue job with photo metadata
- [ ] Handle R2 failure (mark failed, log)
- [ ] Handle queue failure (mark failed, log)

**Authorization:**
- [ ] Verify event ownership before upload
- [ ] Check event expiration
- [ ] Add requireConsent middleware (if needed per HI_GATE)
- [ ] Return 404 for non-existent events (not 403 to avoid enumeration)

**Error handling:**
- [ ] Return 413 for oversized files
- [ ] Return 415 for unsupported formats
- [ ] Return 402 for insufficient credits
- [ ] Return 410 for expired events
- [ ] Return 500 for R2/queue failures (credit not refunded)
- [ ] Log all post-deduction failures for reconciliation

**Testing:**
- [ ] Unit test: FIFO expiry selection
- [ ] Unit test: race condition prevention
- [ ] Unit test: file validation
- [ ] Integration test: full upload flow
- [ ] Manual test: HEIC from iPhone
- [ ] Manual test: 20 MB file
- [ ] Manual test: concurrent uploads

---

## 15. Dependencies & Blockers

**Upstream dependencies (must be complete):**
- T-1: Database schema ✓ (complete)
- T-2: requirePhotographer middleware ✓ (complete)
- T-13: Events API ✓ (complete, per tasks.md)

**Downstream tasks (blocked on T-16):**
- T-17: Queue consumer (face detection)
- T-19: Upload UI

**External dependencies:**
- Cloudflare R2 (PHOTOS_BUCKET binding configured)
- Cloudflare Queue (PHOTO_QUEUE binding configured)
- Cloudflare Images (subscription active, zone configured)

**Research completed:**
- cf-upload-limits.md ✓
- heic-rekognition.md ✓
- stripe-credit-flow.md ✓

---

## 16. Observability & Monitoring

### Metrics to Track

**Upload success rate:**
- `upload.success` (counter)
- `upload.failure.{reason}` (counter by reason: size, format, credits, r2, queue)

**Credit deduction:**
- `credit.deduction.success` (counter)
- `credit.balance.insufficient` (counter)
- `credit.expiry.lookup_null` (alert if happens)

**Performance:**
- `upload.duration` (histogram: validation, deduction, r2, queue)
- `upload.file_size` (histogram)

**Errors:**
- `upload.r2_failure` (alert)
- `upload.queue_failure` (alert)
- `upload.post_deduction_failure` (alert - requires manual reconciliation)

### Logs to Emit

**Success:**
```json
{
  "event": "upload.success",
  "photographer_id": "uuid",
  "event_id": "uuid",
  "photo_id": "uuid",
  "file_size": 1234567,
  "format": "jpeg",
  "duration_ms": 456
}
```

**Failure (post-deduction):**
```json
{
  "event": "upload.post_deduction_failure",
  "photographer_id": "uuid",
  "photo_id": "uuid",
  "credits_deducted": 1,
  "error": "R2 upload failed",
  "requires_manual_refund": true
}
```

---

## 17. Rollback Strategy

**If upload endpoint causes production issues:**

1. **Feature flag rollback:**
   - Disable upload button in UI (T-19)
   - Return 503 from upload endpoint with "maintenance" message

2. **Code rollback:**
   - Revert PR for T-16
   - Credits already deducted are NOT rolled back (manual refunds)

3. **Data cleanup:**
   - Photos with status='processing' need manual investigation
   - Credit ledger entries remain (immutable)

**Rollback NOT possible:**
- Credit deductions (append-only ledger)
- R2 uploaded files (cleanup job needed)
- DB photos rows (soft delete via status update)

---

## References

**Task definition:**
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/tasks.md` (T-16 section, lines 395-423)

**Related tasks:**
- T-10: Stripe webhook (credit deduction pattern)
- T-13: Events API (event ownership validation)
- T-17: Queue consumer (downstream)
- T-18: Gallery API (R2 key format, CF Images URLs)

**Research:**
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/research/cf-upload-limits.md`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/research/heic-rekognition.md`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/research/stripe-credit-flow.md`

**Plan:**
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/plan/final.md` (lines 293-328: US-7 flow, lines 130-167: credit ledger mechanics)

**Codebase:**
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/photos.ts` (gallery API)
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/credit-ledger.ts`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/photos.ts`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/queue/photo-consumer.ts`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/wrangler.jsonc` (R2, queue bindings)
