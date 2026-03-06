# Photo Pipeline V2 — Architecture Plan

## Goal

Replace the two-stage CF queue system (upload consumer → photo consumer) with a single-stage pipeline. CF handles coordination and state. Modal handles all compute. One queue, one round trip, batch processing.

## Motivation

- Current two-stage queue exists because of old AWS Recognition TPS pacing — no longer needed with Modal
- Double CF ↔ Modal round trips add latency and failure surface
- CF Workers are memory-constrained (128MB) — image decode/normalization is risky there
- CF Queues are conservative about fanning out work — larger batches compensate

---

## End-to-End Flow

```
R2 PutObject (uploads/* prefix)
  │
  ▼
CF Queue: photo-pipeline-{env}
  max_batch_size = 50
  max_concurrency = N (throttle knob)
  max_retries = 2
  DLQ: photo-pipeline-dlq-{env}
  │
  ▼
CF Worker: Photo Consumer (batch, Promise.all)
  │  For each message in batch (concurrently via Promise.all):
  │    1. HEAD R2 object → reject if Content-Length > 50MB
  │    2. Match R2 key → upload_intent
  │    3. Claim intent (CAS update → 'processing')
  │    4. Pre-debit credits (1 base + 1 if auto-edit/LUT enabled = up to 2)
  │    5. Generate presigned GET URL (for raw upload)
  │    6. Generate presigned PUT URLs (original + processed if auto-edit)
  │
  │  Collect all claimed jobs into single batch payload
  │
  │  ONE HTTP POST to Modal orchestrator (HMAC signed)
  │
  ▼
Modal: Orchestrator fn (CPU, low memory, high concurrency)
  │  For each job (fanned out via .spawn() or .map()):
  │
  │  ┌─→ Image Pipeline fn (CPU, high memory, low concurrency)
  │  │     1. Fetch raw image from presigned GET
  │  │     2. Validate magic bytes + parse header dimensions
  │  │     3. Reject if W × H > 100MP (pre-decode safety)
  │  │     4. Decode → normalize (resize to max 2500px, JPEG)
  │  │     5. Write normalized to Volume (/vol/{jobId}/normalized.jpeg)
  │  │     6. PUT normalized → presigned URL (R2 original.jpeg)
  │  │     7. If auto-edit/LUT enabled:
  │  │        - Try: process → PUT → presigned URL (R2 processed.jpeg)
  │  │        - On failure: log error, continue (does NOT block pipeline)
  │  │     8. Extract EXIF metadata
  │  │     9. Return: metadata, EXIF, auto_edit_succeeded (bool)
  │  │
  │  └─→ Recognition fn (GPU T4, low concurrency)
  │        1. Read /vol/{jobId}/normalized.jpeg (no R2 hop)
  │        2. Extract faces + 512-D embeddings
  │        3. Delete /vol/{jobId}/ (cleanup after itself)
  │        4. Return: embeddings[], face count, bounding boxes
  │
  │  Collect all results into single response
  │
  │  ONE HTTP POST callback to CF (HMAC signed)
  │
  ▼
CF Worker: Callback Endpoint (POST /internal/pipeline/callback)
  │  Verify HMAC signature + timestamp (reject if > 5 min)
  │
  │  For each job result:
  │  On EXTRACTION SUCCESS:
  │    - Insert photo record (status: 'indexed', r2 keys, EXIF, face count)
  │    - Insert face embeddings (pgvector)
  │    - If auto-edit failed: refund 1 processing credit
  │    - Mark upload_intent → 'completed'
  │    - Mark photo_job → 'completed'
  │
  │  On TOTAL FAILURE (normalization or extraction failed):
  │    - Refund all pre-debited credits (1 or 2)
  │    - Mark upload_intent → 'failed' (with error code, retryable flag)
  │    - Mark photo_job → 'failed'
```

---

## Component Profiles

| Component | Runtime | Memory | Concurrency | Scaling |
|-----------|---------|--------|-------------|---------|
| CF Photo Consumer | CF Worker | ~128MB (no image bytes) | Queue `max_concurrency` | CF manages |
| CF Callback Endpoint | CF Worker | ~128MB | On-demand (HTTP) | CF manages |
| Modal Orchestrator | CPU | Low (~256MB) | `max_inputs=200+` | Few containers, high concurrency |
| Modal Image Pipeline | CPU | High (~2-4GB) | `max_inputs=2` | `max_containers` horizontal scaling |
| Modal Recognition | GPU T4 | High (~4GB) | `max_inputs=2-4` | `max_containers` horizontal scaling |

---

## Concurrency Control

Two knobs. No custom rate limiting, no Durable Objects, no token buckets.

| Knob | Where | What it controls |
|------|-------|-----------------|
| Queue `max_concurrency` | CF Wrangler config | Max consumer invocations in flight (feed rate) |
| `max_containers` per fn | Modal deploy config | Compute ceiling / spend cap per function |

CF controls the feed rate. Modal caps compute spend. Modal's internal request buffer handles backpressure (up to 2,000 pending per function).

---

## Credit Flow

Credits are pre-debited in CF before calling Modal (happy path assumption). Refunds are **granular per operation**, not all-or-nothing.

### Pre-debit (CF, before Modal call)

| Scenario | Credits debited |
|----------|----------------|
| Base upload (no auto-edit/LUT) | 1 |
| Upload + auto-edit or LUT enabled | 2 (1 base + 1 processing) |

### Refund (CF, on callback)

The pipeline proceeds as far as it can. Auto-edit failure does NOT block extraction.

| Outcome | Normalize | Auto-edit/LUT | Extraction | Refund | Net debit |
|---------|-----------|---------------|------------|--------|-----------|
| Full success | OK | OK | OK | 0 | 2 |
| Auto-edit fails, rest OK | OK | FAIL | OK | 1 (processing) | 1 |
| Everything fails | FAIL | — | — | all (1 or 2) | 0 |
| Normalize OK, extraction fails | OK | OK or FAIL | FAIL | all (1 or 2) | 0 |
| Modal never calls back | — | — | — | all (reconciliation cron) | 0 |

**Key rule**: If extraction succeeds, the base credit stays debited (photo is indexed and usable). The processing credit only stays if auto-edit/LUT actually succeeded. If extraction fails, everything is refunded — no usable photo was produced.

---

## Webhook Security (HMAC-SHA256)

Single shared secret (`PIPELINE_HMAC_SECRET`), rotatable via env var on both sides.

### CF → Modal (request)
- CF computes `HMAC-SHA256(secret, timestamp + request_body)`
- Sends `X-Signature` + `X-Timestamp` headers
- Modal verifies before processing

### Modal → CF (callback)
- Modal computes `HMAC-SHA256(secret, timestamp + response_body)`
- Sends `X-Signature` + `X-Timestamp` headers
- CF verifies before applying state changes
- Reject if timestamp drift > 5 minutes (replay protection)

---

## Data Storage

### Database tables

| Table | Role | Changes |
|-------|------|---------|
| `upload_intents` | Ingress lifecycle | Existing, unchanged |
| `photo_jobs` | Processing state machine | New |
| `photos` | Final materialized photo record | Existing, unchanged |
| `face_embeddings` | 512-D pgvector embeddings | Existing, unchanged |

### R2 keys

| Key pattern | What | Written by |
|-------------|------|-----------|
| `uploads/{intentId}/{filename}` | Raw upload from client | Client / iOS / FTP |
| `events/{eventId}/{photoId}/original.jpeg` | Normalized, no edits | Modal Image Pipeline |
| `events/{eventId}/{photoId}/processed.jpeg` | After auto-edit/LUT | Modal Image Pipeline (if enabled) |

### Modal Volume (`/vol/`)

| Path | What | Lifecycle |
|------|------|-----------|
| `/vol/{jobId}/normalized.jpeg` | Temp normalized image for recognition | Written by Image Pipeline, read + deleted by Recognition. Safety cron sweeps anything > 30 min. |

---

## Failure & Retry

### Retryability

Only **insufficient credits** is retryable (user may top up). Everything else is non-retryable — validation failures, image corruption, Modal processing errors are all terminal.

| Failure point | Retryable | Action |
|---------------|-----------|--------|
| R2 HEAD > 50MB | No | Ack, mark intent failed, no credit debit |
| No matching upload_intent | No | Ack, ignore (orphan) |
| Claim fails (already claimed) | No | Ack, skip |
| Credit debit fails (insufficient) | **Yes** | Ack, mark intent failed + retryable |
| Modal HTTP call fails (timeout/5xx) | No | Ack, mark job failed |
| Modal returns per-job failure | No | Refund credits, mark failed |
| Modal never calls back | No | Reconciliation cron handles (see below) |
| Callback HMAC invalid | No | Reject 401, no state changes |

---

## Responsibilities by Layer

| Layer | Does | Does NOT |
|-------|------|----------|
| CF Photo Consumer | Validate (HEAD only), claim intent, debit credits, generate presigned URLs, batch call Modal, finalize DB state | Touch image bytes, decode images, run models |
| CF Callback Endpoint | Verify HMAC, insert photo + embeddings, complete/fail intents + jobs, refund credits | Call Modal, process images |
| Modal Orchestrator | Coordinate image-pipeline + recognition per job, fan out work, collect results, post callback | Know about credits, DB state, upload intents |
| Modal Image Pipeline | Validate, decode, normalize, auto-edit, LUT, write to R2 + Volume, extract EXIF | Know about faces, credits, orchestration |
| Modal Recognition | Read from Volume, extract faces + embeddings, cleanup volume | Know about image processing, credits, orchestration |

Modal is a pure compute box — presigned URLs in, artifacts + embeddings out. All state lives on CF side.

---

## Cron Jobs & Cleanup

New cron jobs needed for V2. Existing V1 crons remain untouched.

### 1. Stale job reconciliation
- Detect `photo_jobs` stuck in non-terminal state (`queued`, `submitting`, `running`) beyond a threshold (e.g., 15 min)
- These are jobs where Modal never called back (crash, network partition, container killed)
- Action: refund all pre-debited credits, mark job + intent as failed (non-retryable)

### 2. Completed upload cleanup
- After successful processing, the raw upload in `uploads/{intentId}/{filename}` is no longer needed
- Clean up R2 objects for `upload_intents` with status `completed` older than a threshold
- The consumer may handle this inline, but a cron catches any that were missed

### 3. Failed upload cleanup
- Clean up R2 objects for `upload_intents` marked as failed + non-retryable
- Remove any partial artifacts written to R2 (original/processed keys that exist but have no corresponding `photos` row)

### 4. Unmarked failure detection
- Detect `upload_intents` stuck in `processing` state beyond a threshold — these were claimed but never completed or failed (consumer crashed mid-flight, before calling Modal or before marking failure)
- Action: refund credits if debited, mark failed, clean up R2 objects

### 5. Modal Volume sweep (Modal-side)
- Safety net cron on Modal to delete anything in `/vol/` older than 30 min
- Catches files left behind if Recognition fn crashed before cleanup

### 6. Retryable failure re-enqueue
- Detect `upload_intents` marked as failed + retryable (insufficient credits) that are now eligible for retry (e.g., user topped up credits)
- Re-enqueue to the pipeline queue for another attempt
- TBD: how to detect "user topped up" — may need to be triggered by credit purchase flow instead of polling

---

## What's NOT in V2

- No incremental phase reporting — single terminal callback only
- No changes to V1 consumers — coexist via feature flag or separate queue
- No observability wiring yet — add after correctness confirmed
- No migration of existing photos — V2 is forward-only for new uploads

---

## Open Refinements

- [ ] Exact `max_concurrency` value for the queue
- [ ] Exact `max_containers` values for Modal functions
- [ ] `photo_jobs` schema refinements (may simplify from PR #434 draft)
- [ ] Reconciliation cron interval and stale job threshold
- [ ] Volume cleanup cron schedule
- [ ] Whether EXIF extraction stays in Image Pipeline or becomes a separate step
- [ ] Batch size tuning based on real-world CF Queue behavior
