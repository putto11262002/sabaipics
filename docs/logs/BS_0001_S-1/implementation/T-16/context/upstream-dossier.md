# Upstream Dossier: T-16

**Task:** Photo upload API (validation + normalization + credit deduction)
**Root:** BS_0001_S-1
**Generated:** 2026-01-11

---

## Task Goal

Create `POST /events/:id/photos` endpoint that validates, deducts credit (FIFO), normalizes image, uploads to R2, and enqueues for processing.

---

## Acceptance Criteria

- Validates format (JPEG, PNG, HEIC, WebP only)
- Validates size (≤ 20MB)
- Validates credit balance ≥ 1
- Deducts 1 credit with FIFO expiry inheritance
- Normalizes to JPEG (4000px max, quality 90%) via CF Images
- Uploads normalized JPEG to R2
- Inserts photos row with status=processing
- Enqueues job for face detection
- Returns `{ photoId, status }`

---

## Dependencies

| Task | Status | Description |
|------|--------|-------------|
| T-1  | ✓ Done | DB schema (photographers, credit_ledger, events, photos tables) |
| T-2  | ✓ Done | requirePhotographer middleware (auth + DB lookup) |
| T-13 | ✓ Done | Events API (CRUD + QR generation) |

**All dependencies complete** — ready to proceed.

---

## Upstream Plan Guidance

### Storage Strategy (Plan: Architecture Overview)

**One file per photo:** normalized JPEG only (4000px max, ~1-3MB)
- All formats converted on upload (not on-demand)
- Rekognition receives stored JPEG directly (no conversion needed)
- CF Images handles thumbnails/previews on-demand (400px/1200px)
- Download serves the normalized JPEG (high quality, not original)

**Implication:** No original file retention; normalization happens in upload request.

### Upload Validation (Plan: Phase 4, US-7)

| Check | Limit |
|-------|-------|
| Formats | JPEG, PNG, HEIC, WebP |
| Max size | 20 MB |
| Auth | Valid photographer, owns event |
| Event | Not expired |
| Credits | Balance ≥ 1 |

**Rejected cases:**
- RAW files (CR2, NEF, ARW) — not supported
- Files > 20MB — too large
- Unsupported formats — error message lists accepted formats

### Credit Deduction Flow (Plan: Phase 4)

**Critical ordering:**
1. Validation (format, size, auth, credits check)
2. **If validation fails** → 400 error, NO credit deducted
3. **If validation passes** → Deduct 1 credit HERE (FIFO expiry)
4. Normalize image (convert to JPEG, 4000px max)
5. Upload to R2
6. Queue for face detection

**No refund on failure after deduction** — credit is charged before normalization/upload.

### Credit Ledger FIFO Mechanics (Plan: Credit Ledger Mechanics)

**Deduction insert (FIFO expiry):**
```sql
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

**Why FIFO expiry?**
- Deductions inherit expiry from oldest unexpired purchase
- Prevents negative balance after purchases expire
- Simple balance query (SUM unexpired rows)

### Validation Error Messages (Plan: Phase 4, US-7)

| Error | Message |
|-------|---------|
| Wrong format | "Accepted formats: JPEG, PNG, HEIC, WebP" |
| Too large | "Maximum file size is 20MB" |
| No credits | "Insufficient credits. Purchase more to continue." |
| Event expired | "This event has expired" |

### API Contract (Plan: API Summary, Phase 4)

**Endpoint:**
```
POST /events/:id/photos
Body: multipart/form-data (file)
Response: { photoId, status: "processing" }
```

**Flow after upload:**
1. Photos row: `status=processing`
2. Job enqueued for face detection
3. UI shows "Processing..." badge

---

## Load-Bearing References

### Research Documents

| File | Key Findings |
|------|--------------|
| `docs/logs/BS_0001_S-1/research/cf-upload-limits.md` | CF Workers: 100MB limit (Free/Pro)<br>CF Images: 70MB input limit<br>**Recommended: 20MB max upload** (updated from 50MB in research)<br>Supported formats: JPEG, PNG, HEIC, WebP (RAW not supported) |

### Plan References

| Section | Location | Key Info |
|---------|----------|----------|
| Database schema | `plan/final.md` → Database Schema | `photos` table: `id, event_id, r2_key, status, face_count, uploaded_at`<br>Single `r2_key` (normalized JPEG only) |
| Storage strategy | `plan/final.md` → Architecture Overview | Normalize all uploads to JPEG (4000px max, quality 90%) |
| Upload flow | `plan/final.md` → Phase 4: US-7 | 11-step flow with credit deduction BEFORE normalization |
| Credit mechanics | `plan/final.md` → Credit Ledger Mechanics | FIFO expiry inheritance via subquery |
| Validation rules | `plan/final.md` → Upload Validation | Format + size + auth + event status + credit balance |

---

## Implied Contracts

### Database (photos table)

**Schema (from T-1):**
```
photos
  id              uuid primary key
  event_id        uuid not null (fk → events.id)
  r2_key          text not null (single key: normalized JPEG)
  status          text not null (enum: 'processing', 'indexed', 'failed')
  face_count      int (nullable until indexed)
  uploaded_at     timestamp not null
```

**Constraint:** `r2_key` format must be deterministic for CF Images URL generation later.

### R2 Storage

**Bucket:** `[NEED_VALIDATION]` Which bucket name? (e.g., `sabaipics-photos-production`)

**Key format:** `[NEED_DECISION]` Suggested: `{event_id}/{photo_id}.jpg`
- Pros: Clean namespace per event, predictable URLs
- Cons: Event ID exposed in URL (low risk if access_code is secret)

**Alternative:** `photos/{photo_id}.jpg` (flat structure)

### Cloudflare Images Normalization

**Service:** `[NEED_VALIDATION]` CF Images Transform endpoint/binding

**Parameters:**
- Max width: 4000px
- Format: JPEG
- Quality: 90%
- Fit: contain (preserve aspect ratio)

**Input:** multipart file from request (JPEG/PNG/HEIC/WebP)
**Output:** Normalized JPEG binary (stream to R2)

**Uncertainty:** `[GAP]` How to call CF Images Transform from Workers?
- Option A: Use `/cdn-cgi/image/` URL transform (public endpoint)
- Option B: Workers binding (if exists)
- Option C: External API call to CF Images

### Queue (face detection)

**Queue:** `[NEED_VALIDATION]` Which queue name? (e.g., `photo-processing-queue`)

**Job payload:**
```json
{
  "photoId": "uuid",
  "eventId": "uuid",
  "r2Key": "string"
}
```

**Consumer:** T-17 (Photo queue consumer)

---

## Key Constraints

### Performance

- **Target:** < 30s p95 for 20MB upload
  - Upload: ~10-15s on 10Mbps (typical Thai broadband)
  - Normalization: ~2-5s (CF Images)
  - R2 upload: ~1-2s
  - DB + queue: < 1s

### Atomicity

**Critical:** Credit deduction must be atomic with photo row creation.
- Use transaction: deduct credit → insert photo row
- If either fails, rollback both
- `[NEED_VALIDATION]` Drizzle transaction support in Cloudflare Workers

### Error Handling

**Before credit deduction:**
- Validation errors → 400 with user-friendly message
- Auth errors → 401/403
- Event not found → 404

**After credit deduction:**
- Normalization failure → Log, return 500, NO refund
- R2 upload failure → Log, return 500, NO refund
- Queue enqueue failure → Log, return 200 (job will retry), NO refund

**Rationale:** Accepting "no refund" policy per plan decision #13.

### Idempotency

**Consideration:** `[NEED_DECISION]` Should duplicate uploads be prevented?
- Option A: Accept duplicates (photographer's choice)
- Option B: SHA-256 hash check (expensive, requires reading full file twice)

**Recommendation:** Accept duplicates for MVP (simpler, faster).

---

## Success Criteria

### Functional

- [ ] Upload JPEG → validates, deducts credit, normalizes, stores, queues
- [ ] Upload PNG → converts to JPEG, same flow
- [ ] Upload HEIC → converts to JPEG, same flow
- [ ] Upload WebP → converts to JPEG, same flow
- [ ] Reject RAW files → clear error message
- [ ] Reject oversized files (> 20MB) → clear error message
- [ ] Reject when no credits → clear error message
- [ ] Reject when event expired → clear error message
- [ ] Reject when event not owned by photographer → 403 error

### Data Integrity

- [ ] Credit deduction uses FIFO expiry (inherits from oldest purchase)
- [ ] Credit balance accurate after upload (sum unexpired rows)
- [ ] Photos row created with `status=processing`
- [ ] R2 key stored correctly in DB
- [ ] Queue job enqueued with correct payload

### Performance

- [ ] 20MB upload completes in < 30s (p95)
- [ ] Validation errors return in < 1s
- [ ] No memory leaks on large file uploads

### Observability

- [ ] Log upload start (photographer_id, event_id, file_size, file_type)
- [ ] Log validation errors (reason)
- [ ] Log credit deduction (photographer_id, balance_before, balance_after)
- [ ] Log normalization start/end (duration)
- [ ] Log R2 upload start/end (duration, r2_key)
- [ ] Log queue enqueue (job_id, photo_id)
- [ ] Log errors with context (stack trace, request_id)

---

## Testing Requirements (from tasks.md)

- Unit test validation (format, size)
- Test credit deduction with expiry
- Test normalization (mock CF Images)
- Integration test full flow

---

## Rollout & Risk (from tasks.md)

**Risk Level:** High (core feature, payments involved)

**Monitoring:**
- Upload success rate (target: > 95%)
- Validation rejection rate by reason (format, size, credits, etc.)
- Normalization failures (should be < 1%)
- R2 upload failures (should be < 0.1%)
- Credit deduction errors (should be 0%)

**Testing:**
- Test with real HEIC files from iPhone
- Test on slow connections (simulate 1Mbps upload)
- Test concurrent uploads (same photographer, different events)
- Test edge cases: exactly 20MB, 0 credits, expired event

---

## Open Questions / Gaps

1. **`[NEED_VALIDATION]`** R2 bucket name for production photos?
2. **`[NEED_DECISION]`** R2 key format: `{event_id}/{photo_id}.jpg` or `photos/{photo_id}.jpg`?
3. **`[NEED_VALIDATION]`** Queue name for face detection jobs?
4. **`[GAP]`** How to call CF Images Transform from Workers? (binding? API?)
5. **`[NEED_VALIDATION]`** Drizzle transaction support in Cloudflare Workers?
6. **`[NEED_DECISION]`** Idempotency strategy (accept duplicates or SHA-256 hash)?
7. **`[NEED_VALIDATION]`** Error handling: should normalization/R2 failures mark photo as `failed` or retry?

---

## Summary

T-16 implements the critical upload flow that ties together authentication, credit management, image processing, and storage. All dependencies are complete. The primary technical challenges are:

1. **Credit deduction atomicity** (transaction required)
2. **CF Images integration** (normalization in request flow)
3. **Error handling post-deduction** (no refunds, log everything)

Key decision from plan: **No original file retention** — normalized JPEG is the source of truth.

**Status:** Ready for implementation after resolving open questions above.
