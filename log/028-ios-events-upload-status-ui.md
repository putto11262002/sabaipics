Date: 2026-02-09

Context

- SAB-40: File sync pipeline with offline support.
- Events tab should surface background upload health even when capture session ends.

Changes

- Updated Events tab to act as upload status UI.
  - `apps/studio/SabaiPicsStudio/Views/EventsHomeView.swift`
  - Adds a one-line Online/Offline + Syncing/Up-to-date header with icons and tint.
  - Adds simple stats cards (Pending jobs / Active events / Synced events).
  - Event rows are no longer navigable; they show event name + sync state ("N left" badge or checkmark).
- Added per-event upload aggregation for UI.
  - `apps/studio/SabaiPicsStudio/Services/UploadQueueStore.swift` adds grouped counts by (event_id, state).
  - `apps/studio/SabaiPicsStudio/Services/UploadManager.swift` adds per-event summary helpers.

Notes

- Failures are currently included in "pending" and not surfaced explicitly in the Events UI.
