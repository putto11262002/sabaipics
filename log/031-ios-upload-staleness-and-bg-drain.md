# 031 - iOS Upload Staleness + Background Drain Reliability

Follow-up on PR #107 Codex feedback.

## Goals

- Avoid incorrectly resetting long-running background URLSession uploads as "stale".
- Ensure BG drain work returns promptly (do not await long PUTs under BGProcessing).
- Reconcile uploads that finish while no continuation is awaiting (fire-and-forget or app relaunch).

## Changes

- `UploadManager.recoverStaleJobs()` now checks active background URLSession tasks and only recovers `uploading` jobs that have no matching in-flight task.
- `BackgroundUploadSessionManager` exposes:
  - `getAllTasks()` for in-flight inspection
  - `startUpload(...)` for fire-and-forget PUTs
  - `onOrphanUploadCompletion` callback to reconcile completion when there is no awaiting continuation
- `UploadManager.drainOnce()` starts at most one background PUT and then returns so the system can continue the transfer.

## Files

| File                                                                  | Change                                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/studio/FrameFast/Services/UploadManager.swift`                  | staleness recovery uses in-flight tasks; bg drain start-and-return; orphan completion reconciliation |
| `apps/studio/FrameFast/Services/BackgroundUploadSessionManager.swift` | add getAllTasks/startUpload + orphan completion callback                                             |
| `apps/studio/FrameFast/Services/UploadQueueStore.swift`               | add query helper for stale uploading job IDs                                                         |
