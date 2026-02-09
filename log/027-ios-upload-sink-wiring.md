# iOS Upload Sink Wiring (Selected Event)

Date: 2026-02-08

Context

- SAB-40: tie captured photos (spooled to local URL) into the durable upload queue.
- Event selection UX will be improved later (select before capture flow), but we need a working plumbing path now.

Changes

- Added a persisted `selectedEventId` on `AppCoordinator`.
  - `apps/studio/SabaiPicsStudio/Stores/AppCoordinator.swift`
  - Stored in `UserDefaults` under `SelectedEventId`.

- Events list can mark an event as the capture destination.
  - `apps/studio/SabaiPicsStudio/Views/EventsHomeView.swift`
  - Context menu: "Use For Capture" and "Clear Capture Event".

- Capture pipeline enqueues uploads when an event is selected.
  - `apps/studio/SabaiPicsStudio/Stores/CaptureSessionStore.swift`
  - `apps/studio/SabaiPicsStudio/Stores/CaptureSessionController.swift`
  - `apps/studio/SabaiPicsStudio/Views/MainTabView.swift`
  - `UploadQueueSink` reads the selected event id via an async provider (MainActor-safe) and enqueues jobs into `UploadManager`.

Notes

- If no event is selected, photos are still spooled locally but no upload jobs are enqueued.
