# Upstream Dossier: T-17

**RootId**: `BS_0001_S-1`
**TaskId**: `T-17`
**Generated**: 2026-01-12

---

## Task Definition

From `docs/logs/BS_0001_S-1/tasks.md`:

### T-17 — Photo queue consumer (Rekognition indexing)
- [ ] Done
- **Type:** `feature`
- **StoryRefs:** US-8
- **Refs:** `docs/logs/BS_0001_S-1/research/heic-rekognition.md`
- **Goal:** Update queue consumer to create Rekognition collection on first photo, call IndexFaces, and store full response.
- **PrimarySurface:** `Jobs`
- **Scope:** `apps/api/src/queue/photo-consumer.ts`
- **Dependencies:** `T-1`, `T-16`
- **Acceptance:**
  - If `events.rekognition_collection_id` is NULL, create collection and save ID
  - Fetch normalized JPEG from R2
  - Call Rekognition IndexFaces
  - Insert faces rows with full `rekognition_response` JSONB
  - Update photos row: status=indexed, face_count=N
  - Handle no-faces case (face_count=0, still indexed)
  - Retry with backoff on Rekognition errors
  - DLQ after 3 failures
- **Tests:**
  - Unit test with mock Rekognition
  - Test collection creation on first photo
  - Test no-faces handling
  - Test retry logic
- **Rollout/Risk:**
  - High risk (external service, cost)
  - Monitor Rekognition API errors
  - Monitor rate limiter DO

---

## Dependency Status

| Task | Status | Description |
|------|--------|-------------|
| T-1 | [x] Done | Database schema (all tables including `photos`, `faces`, `events`) |
| T-16 | [x] Done | Photo upload API (validation + normalization + credit deduction) |

**Verdict**: All dependencies satisfied. T-16 provides normalized JPEGs in R2 and creates `photos` rows with `status=processing`.

---

## Relevant Plan Excerpts

### US-8: Face Detection Flow (from `final.md`)

```
| Step | Surface | Action |
|------|---------|--------|
| 1 | Queue | Dequeue job |
| 2 | Queue | Check `events.rekognition_collection_id` |
| 3 | Queue | **If NULL:** Create collection, save ID |
| 4 | Queue | Fetch normalized JPEG from R2 |
| 5 | Queue | Call Rekognition `IndexFaces` (direct, no conversion needed) |
| 6 | DB | Insert `faces` rows with full Rekognition response (JSONB) |
| 7 | DB | Update `photos`: `status=indexed`, `face_count=N` |
```

**Key constraint**: Stored file is already JPEG (normalized by T-16), guaranteed < 5MB. No conversion needed.

### Rekognition Response Storage (from `final.md`)

**Rekognition response stored (JSONB):**
- Bounding box
- Confidence score
- Landmarks (eyes, nose, mouth positions)
- Quality metrics (brightness, sharpness)
- Pose (pitch, roll, yaw)
- Face ID (for search while collection exists)

**Rationale**: Store full response for future model training.

### Data Flow

```
T-16 (Upload API)
  ├─► Validates, deducts credit, normalizes to JPEG (4000px max, quality 90%)
  ├─► Uploads normalized JPEG to R2
  ├─► Inserts photos row: status=processing, r2_key=<key>
  └─► Enqueues job { photoId, eventId }
       │
       ▼
T-17 (Queue Consumer)
  ├─► Fetches normalized JPEG from R2 (already JPEG, no conversion)
  ├─► Creates Rekognition collection on first photo (if NULL)
  ├─► Calls IndexFaces with JPEG bytes
  ├─► Inserts faces rows with full response
  └─► Updates photos: status=indexed, face_count=N
```

---

## Database Schema Contracts

From `final.md`:

### `events` Table
```
id, photographer_id, name, start_date, end_date, 
access_code, qr_code_r2_key, 
rekognition_collection_id (NULLABLE), 
expires_at, created_at
```

**Key field**: `rekognition_collection_id` starts NULL. First photo in event triggers collection creation.

### `photos` Table
```
id, event_id, r2_key, status, face_count, uploaded_at
```

**Status states**:
- `processing` — Set by T-16 on upload
- `indexed` — Set by T-17 after IndexFaces succeeds
- (implicit failure states for T-17 to handle)

**Key field**: `r2_key` points to normalized JPEG in R2.

### `faces` Table
```
id, photo_id, rekognition_face_id, bounding_box, 
rekognition_response (JSONB), indexed_at
```

**Key field**: `rekognition_response` stores full AWS Rekognition IndexFaces response (not just face ID).

---

## Queue Integration

From context:

**Queue system**: Cloudflare Queues
**Consumer pattern**: Durable Object for rate limiting (mentioned in risk section)

**Job payload** (inferred from T-16):
```json
{
  "photoId": "<uuid>",
  "eventId": "<uuid>"
}
```

**Retry policy** (acceptance):
- Exponential backoff on Rekognition errors
- Dead Letter Queue (DLQ) after 3 failures

**Error handling** (from T-16 existing pattern):
- `InvalidImageFormatException` — Should NOT happen (T-16 guarantees JPEG)
- Rekognition throttling — Retry with backoff
- Rekognition unavailable — Retry with backoff
- Network errors — Retry with backoff
- DLQ after 3 retries

---

## Rekognition API Contracts

From `research/heic-rekognition.md`:

### IndexFaces API
**Supported formats**: PNG, JPEG only (HEIC/WebP NOT supported)
**Max size**: 5 MB raw bytes (15 MB from S3)
**Returns**: Array of face records with:
- FaceId (UUID for collection searches)
- BoundingBox
- Confidence
- Landmarks (eyes, nose, mouth, etc.)
- Quality (Brightness, Sharpness)
- Pose (Pitch, Roll, Yaw)

**Collection lifecycle**:
- Collections are event-scoped
- Collection ID format: `event-<event_id>`
- Cleanup: Cron job (T-20) deletes collections after 30 days

### CreateCollection API
**Input**: CollectionId (string)
**Output**: CollectionArn, StatusCode (200 = success)
**Idempotency**: Creating existing collection returns error — must check first or handle.

---

## Load-Bearing Research

### `docs/logs/BS_0001_S-1/research/heic-rekognition.md`

**Key decision**: Use Cloudflare Images Transform to convert HEIC/WebP to JPEG before Rekognition.

**Critical finding**: T-16 already normalizes ALL uploads to JPEG (4000px max, quality 90%). T-17 receives pre-normalized JPEG, no conversion needed.

**Implication for T-17**:
- Fetch from R2 is always JPEG
- No format detection needed in consumer
- Direct pass-through to Rekognition IndexFaces
- Guaranteed < 5MB (T-16 enforces this during normalization)

---

## Gaps and Uncertainties

### [NEED_DECISION] Collection naming convention
- **Question**: Collection ID format — is it `event-<uuid>` or `collection-<uuid>`?
- **Impact**: Must match cleanup cron (T-20) expectations
- **Assumption**: Use `event-<eventId>` for traceability

### [NEED_VALIDATION] Rekognition collection idempotency
- **Question**: What if CreateCollection is called for existing collection?
- **Options**: 
  1. Check existence first (DescribeCollection)
  2. Catch ResourceAlreadyExistsException and proceed
- **Preferred**: Option 2 (simpler, idempotent)

### [NEED_DECISION] Face count = 0 handling
- **Acceptance says**: "Handle no-faces case (face_count=0, still indexed)"
- **Question**: Is this success or failure? Should photos with 0 faces be surfaced differently in gallery?
- **Assumption**: Success state, status=indexed, face_count=0

### [NEED_VALIDATION] Retry strategy specifics
- **Acceptance says**: "Retry with backoff on Rekognition errors"
- **Question**: Initial delay? Max delay? Exponential base?
- **Assumption**: Follow Cloudflare Queues default retry policy or standard exponential (1s, 2s, 4s)

### [NEED_VALIDATION] DLQ handling
- **Acceptance says**: "DLQ after 3 failures"
- **Question**: What happens to photo row in DB when DLQ'd?
- **Options**:
  1. Leave status=processing (appears stuck to user)
  2. Set status=failed (requires new status value)
  3. Add error_message field
- **Recommendation**: Add status=failed + error_message for observability

### [GAP] Rate limiter DO implementation
- **Risk mentions**: "Monitor rate limiter DO"
- **Question**: Does rate limiter DO already exist? Or is T-17 responsible for implementing it?
- **Impact**: Rekognition has rate limits (default: 5 TPS for IndexFaces)
- **Assumption**: T-17 includes basic rate limiting or integrates with existing DO

### [GAP] R2 fetch mechanism
- **Question**: Public URL? Presigned URL? Direct R2 binding?
- **Context**: T-16 uploads to R2, but access pattern not specified
- **Assumption**: Worker has R2 binding, use `env.R2_BUCKET.get(r2_key)`

---

## Implied Contracts

### Input (from T-16)
- **Queue message**: `{ photoId, eventId }`
- **DB state**: `photos` row exists with status=processing, r2_key populated
- **R2 state**: Normalized JPEG exists at r2_key, size < 5MB

### Output (T-17 success)
- **DB state**: 
  - `photos.status = "indexed"`
  - `photos.face_count = N` (where N >= 0)
- **DB state**: `faces` rows inserted (0 to many)
- **DB state**: `events.rekognition_collection_id` populated (if was NULL)

### Output (T-17 failure → DLQ)
- **DB state**: [NEED_DECISION] status=failed? error logged?
- **Observability**: Error logged for monitoring

---

## Test Coverage Requirements

From acceptance criteria:

1. **Unit test with mock Rekognition**
   - Mock IndexFaces success (0 faces, 1 face, multiple faces)
   - Mock IndexFaces errors (throttling, unavailable, invalid image)
   
2. **Test collection creation on first photo**
   - Event with NULL rekognition_collection_id
   - Verify CreateCollection called
   - Verify event.rekognition_collection_id updated
   - Verify subsequent photos skip CreateCollection

3. **Test no-faces handling**
   - IndexFaces returns empty FaceRecords array
   - Verify face_count=0
   - Verify status=indexed (not failed)

4. **Test retry logic**
   - Mock transient Rekognition error
   - Verify retry with backoff
   - Verify DLQ after 3 failures

---

## Risk Summary

**High risk factors**:
1. External service dependency (AWS Rekognition) — availability, rate limits, cost
2. Rekognition API errors — must handle gracefully, not lose photo data
3. First photo collection creation — race condition if multiple photos uploaded simultaneously
4. Rate limiting — Rekognition TPS limits must be respected

**Mitigation strategies**:
- Retry with exponential backoff
- DLQ for non-retryable errors
- Monitor Rekognition API errors (alarms/dashboards)
- Rate limiter DO to prevent throttling
- Idempotent collection creation (catch AlreadyExists)

---

## Success Criteria Checklist

- [ ] If `events.rekognition_collection_id` is NULL, create collection and save ID
- [ ] Fetch normalized JPEG from R2
- [ ] Call Rekognition IndexFaces with JPEG bytes
- [ ] Insert `faces` rows with full `rekognition_response` JSONB
- [ ] Update `photos` row: status=indexed, face_count=N
- [ ] Handle no-faces case (face_count=0, still indexed)
- [ ] Retry with backoff on Rekognition errors
- [ ] DLQ after 3 failures
- [ ] Unit test with mock Rekognition
- [ ] Test collection creation on first photo
- [ ] Test no-faces handling
- [ ] Test retry logic

---

## References

- Task definition: `docs/logs/BS_0001_S-1/tasks.md` (T-17 section)
- Execution plan: `docs/logs/BS_0001_S-1/plan/final.md` (US-8, Phase 4)
- Research: `docs/logs/BS_0001_S-1/research/heic-rekognition.md` (Rekognition format constraints)
- Database schema: `docs/logs/BS_0001_S-1/plan/final.md#database-schema`
- Upstream task: T-16 (Photo upload API)
- Downstream task: T-20 (Rekognition cleanup cron)

