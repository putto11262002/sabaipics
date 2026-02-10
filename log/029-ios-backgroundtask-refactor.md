# 029 - SwiftUI .backgroundTask Refactor (Upload Drain)

Context: follow-up from the iOS background upload work (Issue/PR #103) and the redesign discussion in `discussion.md`.

## Changes

- Moved the BGProcessingTask handler from `BGTaskScheduler.shared.register(...)` in `AppDelegate` into SwiftUI via `.backgroundTask(.processing(...))`.
- Removed the `AppDelegate.sharedCoordinator` singleton bridge (anti-pattern + init-order hazard).
- Narrowed the remaining AppDelegate bridge to background URLSession completion handling only, via `AppDelegate.sharedBackgroundSession`.

## Notes

- Scheduling is still explicit via `BGTaskScheduler.shared.submit(...)` in `AppCoordinator.scheduleBackgroundDrainIfNeeded()`.
- Execution now runs inside the SwiftUI background task closure; iOS expiration should cancel the task, and completion is handled when the closure returns.

## Files

| File                                                | Change                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/studio/FrameFast/FrameFastApp.swift`          | Add `.backgroundTask` handler; simplify AppDelegate to URLSession bridge |
| `apps/studio/FrameFast/Stores/AppCoordinator.swift` | Remove BGTask handler plumbing; wire `sharedBackgroundSession`           |
