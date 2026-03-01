# Desktop Uploader MVP - Technical Plan (Draft)

## Architecture

- **Tauri app** (Rust core + React UI)
- **Local SQLite job queue** for durability and restart safety
- **File watcher** + periodic scan for discovery
- **Upload API flow:**
  - `POST /uploads/presign` → presigned R2 PUT
  - R2 event notification → `upload-consumer` finalizes
  - `GET /uploads/status` for polling intent status
  - `POST /uploads/:uploadId/presign` for retry

## Auth Flow (Desktop)

- Use **system browser** + **localhost callback**
- Browser redirects to `http://127.0.0.1:<port>/callback` after login
- App exchanges code (PKCE) and stores token securely (keychain)

## Upload Constraints (MVP)

- **Allowed types:** `image/jpeg`, `image/png`, `image/heic`, `image/heif`, `image/webp` (match API)
- **Max size:** 20MB (matches API)
- **Upload method:** presigned URL (single PUT, no multipart)

## Discovery Strategy

- **While running:** filesystem watcher to catch changes
- **On startup:** full recursive scan (since app was offline)
- **Safety scan:** periodic scan every 60–120s to cover missed events

## File Stabilization ("ready" rule)

- Don’t upload on first create/modify event
- Poll size every ~500ms
- Require size unchanged for 2–3 ticks (~1–2s)
- Also require file can be opened for read

## Dedupe / Identity

- Use fast fingerprint: `hash(first 64KB + last 64KB + size)`
- Use as local “already uploaded” key (client-only for MVP)

## Local State Model (SQLite)

- **States:** `PENDING → STABILIZING → UPLOADING → DONE / FAILED`
- Store: retry count, last error, timestamps, file metadata
- Concurrency: 2–6 parallel uploads (configurable)

## Rate Limit + Backpressure (Client-Side)

- Presign route currently has **no explicit server rate limiter**
- We assume **429s will be enforced at some layer** (WAF or future middleware)
- **Client policy:**
  - Only request presign when a worker slot is free
  - Limit concurrent uploads (default 4)
  - On `429` from presign or PUT: pause queue + exponential backoff with jitter
  - No hard retry limit; increase backoff duration over time (cap delay to avoid runaway)
  - Use `POST /uploads/:uploadId/presign` for retry (do not create new intents)

## Upload Flow (Presigned URL)

1. Client detects “ready” file → create job
2. `POST /uploads/presign` with metadata
3. Receive `putUrl` + required headers
4. PUT to R2 with retries on transient failures
5. Poll `GET /uploads/status` until `completed` / `failed`

## Edge Cases

- Rename/move inside watched tree: treat as same file if fingerprint matches
- Delete before upload: mark job failed/skipped with clear error
- Overwrite-in-place: stabilization + fingerprint avoids wrong upload
- First run on huge folders: throttle scan enqueue to avoid UI freeze

## Offline Behavior

- App continues to **queue locally** when offline
- Disable new mapping creation if event list is stale/offline
- Show “Offline / waiting” state instead of errors
- Resume presign + upload automatically when network returns

## UI/UX Expectations

- Folder picker + include subfolders
- Counters: queued / uploading / failed / done
- Activity page with status filter + retry
- Tray controls: pause/resume, open app
