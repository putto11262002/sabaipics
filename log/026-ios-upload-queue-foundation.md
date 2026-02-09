# iOS Upload Queue Foundation

Date: 2026-02-08

Context

- SAB-40: File sync pipeline with offline support.
- Goal: durable local buffer + durable upload queue; delete local only after server marks upload intent `completed`.

Changes

- Added `UploadsAPIClient` for the uploads API.
  - `apps/studio/SabaiPicsStudio/API/UploadsAPIClient.swift`
  - Endpoints used:
    - `POST /uploads/presign`
    - `POST /uploads/:uploadId/presign` (re-presign)
    - `GET /uploads/status?ids=...`

- Added a durable SQLite-backed upload queue store.
  - `apps/studio/SabaiPicsStudio/Services/UploadQueueStore.swift`
  - Table: `upload_jobs` (job state machine + presign fields + backoff scheduling)

- Added `UploadManager` actor to own upload processing.
  - `apps/studio/SabaiPicsStudio/Services/UploadManager.swift`
  - Responsibilities:
    - enqueue jobs (from spooled file URLs)
    - presign/re-presign
    - upload to R2 via presigned PUT
    - poll status until `completed` then delete local file (backend lifecycle: `pending -> completed|failed|expired`)
    - retry/backoff and pause when offline (NWPathMonitor)

- Added `UploadQueueSink` adapter (capture pipeline -> upload queue).
  - `apps/studio/SabaiPicsStudio/Services/UploadQueueSink.swift`
  - Intended to be wired once event selection exists (SAB-39).

Notes

- Upload queue is session-independent (not owned by capture UI). It should run globally.
- Local deletion policy: only after upload intent status is `completed`.

Update: 2026-02-09

- Centralized connectivity monitoring via `ConnectivityService` + `ConnectivityStore`.
  - `apps/studio/SabaiPicsStudio/Services/ConnectivityService.swift`
  - `apps/studio/SabaiPicsStudio/Stores/ConnectivityStore.swift`
- `UploadManager` now uses `ConnectivityService` (single source of truth) instead of owning its own `NWPathMonitor`.
