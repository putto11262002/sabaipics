# 025 - Background, Offline, Crash Upload Handling

Issue: #103 | PR review: #102

## Changes

### Bug fixes (from PR #102 review)

- **P1: Crash recovery for stuck `uploading` jobs** — Added `UploadQueueStore.resetStaleUploadingJobs()` that resets all `uploading` jobs older than threshold to `failed`. Called on every `UploadManager.start()` and `resume()`. On cold start, all `uploading` jobs are stale since the previous process is dead.

- **P2: Presign refresh safety** — `process()` now re-fetches the job from the DB after `upload()` completes, before calling `checkCompletion()`. Ensures `checkCompletion` always sees the latest presign data if `upload()` internally re-presigned due to expiry.

### Background URLSession

- New `BackgroundUploadSessionManager` wraps `URLSessionConfiguration.background` with a stable identifier (`com.sabaipics.studio.upload`).
- Bridges delegate callbacks to `CheckedContinuation` for async/await usage.
- File PUT uploads survive app backgrounding and termination.
- API calls (presign, status) remain on standard `URLSession.shared`.
- Orphan tasks (completed while app was dead) handled by crash recovery: jobs reset to `failed` → worker retries → server confirms completion.

### Reactive offline handling

- Replaced 1-second polling loop with `ConnectivityService.stream()` — worker blocks reactively until `NWPathMonitor` reports online.

### ScenePhase + AppDelegate

- Added `UIApplicationDelegateAdaptor` for `handleEventsForBackgroundURLSession` callback.
- ScenePhase `.active` triggers `uploadManager.resume()` (re-runs crash recovery).
- ScenePhase `.background` stops status polling UI updates to save CPU.

## Files

| File                                                      | Change                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| `FrameFast/Services/UploadQueueStore.swift`               | Added `resetStaleUploadingJobs()`                                 |
| `FrameFast/Services/UploadManager.swift`                  | Crash recovery, presign fix, reactive offline, background session |
| `FrameFast/Services/BackgroundUploadSessionManager.swift` | New — background URLSession wrapper                               |
| `FrameFast/FrameFastApp.swift`                            | AppDelegate adaptor, ScenePhase handling                          |
| `FrameFast/Stores/AppCoordinator.swift`                   | Wire BackgroundUploadSessionManager                               |
