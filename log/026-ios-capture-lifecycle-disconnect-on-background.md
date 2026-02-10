# 026 - iOS Capture Lifecycle: Disconnect on Inactive/Background

## Context

PTP/IP capture uses long-lived TCP connections and monitoring tasks.
On iOS, we treat capture as foreground-only and tear down the camera session when the app is no longer active.

## Changes

- Disconnect capture session when app transitions to `.inactive` or `.background` (fire-and-forget; do not await).
- Keep screen awake only while capture is active (disable idle timer during active capture; re-enable otherwise).

## Files

| File                                                                 | Change                                                                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/studio/FrameFast/FrameFastApp.swift`                           | Post lifecycle notification on `.inactive` and `.background`                                                                     |
| `apps/studio/FrameFast/Views/MainTabView.swift`                      | Receive lifecycle notification and call `CaptureSessionStore.disconnect()`; toggle `isIdleTimerDisabled` while capture is active |
| `apps/studio/FrameFast/Services/CaptureLifecycleNotifications.swift` | New notification name definition                                                                                                 |
