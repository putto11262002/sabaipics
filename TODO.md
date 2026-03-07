# TODO — Desktop Uploader (FrameFast)

## Completed — Sync Engine Architecture

### Core Infrastructure
- [x] DB actor thread — dedicated `std::thread` owns `rusqlite::Connection`, communicates via `mpsc` + `oneshot`
- [x] SQLite schema — `sync` + `upload_jobs` tables with WAL mode, fingerprint dedup index
- [x] BLAKE3 fingerprinting — small files full hash, large files first+last 64KB
- [x] Parallel scan pipeline — walkdir → `spawn_blocking` fan-out fingerprint (Semaphore(8)) → batch DB upsert
- [x] FS watcher — `notify` crate (FSEvents on macOS), 500ms debounce, pause/cancel support
- [x] Per-sync engine — watcher + processor loop (700ms tick: scan, stabilize, auto-retry, emit stats)
- [x] File stabilization — monitor file size over N ticks before marking ready
- [x] Global upload worker — single tokio task polling DB across all syncs, `Semaphore(4)` concurrency
- [x] Exponential backoff retry — 1s base, 60s max, 429 gets 15s minimum
- [x] ApiClient trait + MockApiClient (300ms sleep, always succeeds)
- [x] SyncManager — owns DbHandle, ApiClient, engines, lazy UploadWorker
- [x] Tauri commands — add/remove/list syncs, start/stop engine, get stats
- [x] Frontend stats events — `sync://stats` emitted from engine, listened in React

### Testing (via MCP)
- [x] 10 test photos: scanned → fingerprinted → stabilized → uploaded (mock) → done
- [x] Dedup verified: re-scan stays at 10 done
- [x] New file detection via watcher: 2 new files detected → 12 done, 0 failed

---

## Remaining Work

### 1. Real Upload Pipeline
- [ ] Wire `HttpApiClient` — presign URL → PUT to R2/S3 → poll until completed
- [x] Auth token storage — SQLite `auth_kv` table (replaced keychain/keyring)
- [ ] Auth token flow — pass token to upload worker for API calls
- [ ] Handle presign URL expiry — re-request if URL expired before upload starts
- [ ] Upload progress tracking — report bytes uploaded per file to frontend

### 2. Error Handling & Resilience
- [x] API error mapping — structured `ApiError`/`ApiErrorCode`/`PipelineErrorCode` types
- [x] Retry logic — exponential backoff, Retry-After support, per-error-type decisions
- [x] 402 (no credits) — pause ALL engines, surface banner to user, resume on dismiss
- [x] 404/410 (event gone) — stop event engines, fail all pending jobs
- [x] Manual retry — single job or all failed for an event, resets attempt count to 0
- [x] Signal channel — upload worker → manager for cross-cutting error actions
- [ ] Network failure handling — offline detection, queue pause, resume on reconnect
- [ ] File permission errors — graceful skip + log when file becomes unreadable
- [ ] Corrupt/truncated file handling — detect and mark as failed with reason
- [ ] Upload timeout — cancel uploads that stall beyond threshold
- [ ] Disk full / quota exceeded — detect and surface to user

### 3. Upload Pacing & Backoff
- [x] Rate limiting — respect API rate limits (429 → honor Retry-After header)
- [x] Backoff on presign expiry — quick retry (1s) for re-presign
- [ ] Adaptive concurrency — reduce upload slots on repeated failures, restore on success
- [ ] Upload bandwidth throttling — optional user-configurable max bandwidth

### 4. Thorough File Scenario Testing
- [ ] Large files (>1GB RAW photos, video files)
- [ ] Rapid bulk additions (drop 500+ files at once)
- [ ] File deletion mid-upload — handle gracefully
- [ ] File rename/move during sync — detect and handle
- [ ] Files still being written (partial copy from camera/card reader)
- [ ] Symlinks and aliases
- [ ] Non-image files in watch folder — skip or configurable filter
- [ ] Network drive / external drive disconnect mid-sync
- [ ] Unicode and special characters in file paths
- [ ] Duplicate files across different folders (same content, different path)

### 5. UI Polish
- [x] Show event name instead of raw event ID
- [x] User menu dropdown in sidebar (name, email, sign out)
- [x] Credit balance display on Home page (balance, expiring soon, used this month)
- [ ] Better progress display — progress bar, speed indicator, ETA
- [ ] Per-file status list — show individual file states (uploading, done, failed)
- [ ] Error details panel — click failed files to see error reason
- [ ] Drag-and-drop folder selection
- [ ] System tray / menu bar integration — background upload indicator
- [ ] Native notifications — upload complete, errors requiring attention
- [ ] Dark mode support
- [ ] Window state persistence (size, position)

### 6. Activity Logs
- [ ] Activity page — chronological log of all sync events
- [ ] Log entries: file detected, upload started, upload completed, upload failed, retry
- [ ] Filter by sync / event / status
- [ ] Export logs for troubleshooting
- [ ] Log rotation / cleanup for long-running syncs

### 7. Retry Design
- [x] Manual retry from UI — retry all failed for an event (resets attempt_count=0)
- [x] Retry reason tracking — `last_error`, `error_code`, `last_http_status` stored per job
- [ ] Retry policy configuration — max attempts, backoff multiplier, max delay
- [ ] Dead letter queue — files that exceed max retries, with manual re-enqueue

### 8. Configurable Settings

#### Per-Sync Settings
- [ ] Include subfolders toggle (already in schema, wire to UI)
- [ ] File type filter — only upload certain extensions (JPG, RAW, etc.)
- [ ] Pause/resume individual sync

#### Global Settings
- [ ] Upload concurrency limit (default 4, configurable 1-8)
- [ ] Max retry attempts (default 5)
- [ ] Stabilization delay (default N ticks)
- [x] Auto-start engines on app launch for previously-running syncs
- [ ] Startup with OS / login item
- [ ] Storage location for local DB

### 9. Packaging & Distribution
- [ ] App icon and branding
- [ ] macOS code signing and notarization
- [ ] Windows code signing
- [ ] Auto-update mechanism (Tauri updater plugin)
- [ ] Crash reporting in production builds
