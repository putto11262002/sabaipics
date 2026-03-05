# Upload Orchestrator V2 - Context

## Goal
Move upload processing to a new architecture where Cloudflare handles ingestion + normalization + durable state, and Modal orchestrates heavy compute (image processing + face extraction), with Cloudflare as system of record.

## Current Plan
1. Keep `upload_intents` as upload ingress lifecycle.
2. Add `photo_jobs` as processing lifecycle source of truth.
3. Keep existing consumer path intact behind feature flag.
4. Add new consumer path:
   - claim upload intent
   - normalize in CF
   - write canonical original key
   - pre-debit credits
   - submit orchestrator
5. Add internal callback endpoint to apply state transitions, complete/fail jobs, and perform refund logic on failures.

## Implemented In This PR

### 1) New DB table: `photo_jobs`
File: `src/db/schema/photo-jobs.ts`

- Fields include:
  - linkage: `upload_intent_id`, `event_id`, `photographer_id`
  - state: `status`, `attempt`, `max_attempts`
  - orchestrator: `orchestrator_run_id`
  - artifacts: `original_r2_key`, `processed_r2_key`
  - failure/retry: `error_code`, `error_message`, `retryable`
  - credits: `credits_debited`, `credits_refunded`
  - timestamps: `created_at`, `updated_at`, `started_at`, `completed_at`
- Added export + relations wiring:
  - `src/db/schema/index.ts`
  - `src/db/schema/relations.ts`

### 2) New orchestrator request/response contracts
File: `src/api/src/types/orchestration-job.ts`

- Added request payload with CF-provided input/output URLs and callback target.
- Added response shape supporting terminal sync result (`accepted|completed|failed`).

### 3) New Modal orchestrator client (API)
File: `src/api/src/lib/modal-orchestrator-client.ts`

- Added request submission with timeout + explicit error typing.
- Reads endpoint from `MODAL_ORCHESTRATOR_URL`.
- Uses `Modal-Key` / `Modal-Secret` headers.

### 4) New upload consumer path (core logic)
File: `src/api/src/queue/upload-orchestrator-consumer.ts`

- Processes upload queue events and runs new flow:
  - claim `upload_intent`
  - create/ensure `photo_job`
  - fetch uploaded object
  - validate magic bytes
  - normalize with CF Images
  - write canonical original object (`original_r2_key`)
  - pre-debit base credit
  - create presigned GET/PUT URLs
  - call Modal orchestrator
  - update job state and retry/ack based on result
- Intentionally high-signal implementation with no extra observability noise in this path yet.

### 5) New internal callback route
File: `src/api/src/routes/internal-orchestration.ts`

- Endpoint: `POST /internal/orchestration/callback`
- Guard: bearer token (`ORCHESTRATOR_CALLBACK_TOKEN`)
- Handles phase transitions with monotonic progression logic.
- On `completed`:
  - verifies processed artifact exists in R2
  - finalizes `photos` + `upload_intents` + `photo_jobs`
- On `failed`:
  - performs compensating refund if debit exists
  - marks `upload_intents` / `photo_jobs` failed with retryability

### 6) Runtime feature flag wiring
File: `src/api/src/index.ts`

- Added route mount for internal callbacks.
- Added queue switch for upload-processing:
  - `USE_UPLOAD_ORCHESTRATOR=true` -> new consumer
  - otherwise existing `upload-consumer` remains active

### 7) Modal orchestrator service draft (real call flow)
File: `infra/recognition/orchestrator_app.py`

- Reworked to synchronous execution (no fire-and-forget).
- Calls downstream image pipeline endpoint then recognition endpoint.
- Sends progress + terminal callbacks.
- Returns terminal result.
- Configured for I/O-bound profile:
  - low `max_containers`
  - high per-container request concurrency

## Explicitly Not Done Yet
1. No migration generation/execution was run.
2. Existing `upload-consumer` and current production path are not removed.
3. No full face-embedding persistence integration in callback yet (currently finalizes `photos` status/face count only).
4. No additional observability layer on this new path yet (requested to keep high-signal first).
5. No rollout/deployment env var updates performed in this PR.

## Required Env Flags/Secrets For New Path
- `USE_UPLOAD_ORCHESTRATOR` (`true`/`false`)
- `MODAL_ORCHESTRATOR_URL`
- `ORCHESTRATOR_CALLBACK_TOKEN`
- Existing Modal secrets still required for downstream calls where used.

## Recommended Next Steps After Merge
1. Generate and apply DB migration for `photo_jobs`.
2. Deploy orchestrator endpoint and set required env vars/secrets in each environment.
3. Turn on feature flag in staging only.
4. Validate end-to-end callbacks and credit/refund behavior.
5. Add focused observability for the new path after correctness is confirmed.
