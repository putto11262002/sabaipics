# 027 - iOS BGProcessing: Reuse UploadManager + Atomic Queue Claim

## Context

BGProcessing can run while the app process is already alive.
The upload queue is stored in SQLite and processed by `UploadManager`.

## Problem

- Creating a new `UploadManager` in the BGProcessing handler can result in two independent processors
  operating on the same SQLite queue.
- Queue claiming was previously a two-step sequence (`fetchNextRunnable` then `markClaimed`), which
  allowed the same job to be selected twice between calls.

## Changes

- BGProcessing handler reuses the coordinator-owned `UploadManager` when available.
- Added `UploadQueueStore.claimNextRunnable(...)` which fetches + claims a job atomically via a
  single SQLite transaction, and updated processors to use it.

## Files

| File                                                    | Change                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/studio/FrameFast/FrameFastApp.swift`              | Reuse `AppCoordinator` / `UploadManager` in BGProcessing handler |
| `apps/studio/FrameFast/Stores/AppCoordinator.swift`     | Expose coordinator to `AppDelegate`                              |
| `apps/studio/FrameFast/Services/UploadQueueStore.swift` | Add atomic `claimNextRunnable(...)`                              |
| `apps/studio/FrameFast/Services/UploadManager.swift`    | Use `claimNextRunnable(...)` in worker and bgDrain               |
