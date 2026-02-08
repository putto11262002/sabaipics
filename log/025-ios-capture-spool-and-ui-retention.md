# iOS Capture Spool + UI Retention

Date: 2026-02-08

Context: preparing capture architecture for URL-based sinks (upload queue, photo library export, local persistence) by turning the capture session into a pipeline with explicit sinks.

Changes

- Added a local "spool" (staging area) that writes downloaded photo bytes to disk and returns a file URL.
  - `apps/studio/SabaiPicsStudio/Services/CaptureSpool.swift`
  - Default location: `Library/Caches/sabaipics/capture-spool/<session-id>/...`
  - Exposes `store(...) -> Item(url, bytes, createdAt)` and deletion helpers (`deleteFile`, `deleteSession`).

- CapturedPhoto now tracks the local file URL.
  - `apps/studio/SabaiPicsStudio/Models/CapturedPhoto.swift`
  - Added `fileURL: URL?` and made `image` platform-conditional for better tooling compatibility.

- Replaced `TransferSession` with a controller + UI sink.
  - `apps/studio/SabaiPicsStudio/Stores/CaptureSessionController.swift`
    - Implements `PTPIPSessionDelegate` and publishes events into the capture pipeline.
  - `apps/studio/SabaiPicsStudio/Stores/CaptureUISink.swift`
    - UI sink owns placeholders, list updates, RAW banner state, and in-memory retention (last 200).
  - `apps/studio/SabaiPicsStudio/Services/CaptureEventPipeline.swift`
    - Actor that spools downloaded bytes to disk and then fan-outs URL-based events to sinks.
  - `apps/studio/SabaiPicsStudio/Services/CapturePipelineTypes.swift`
    - Normalized event types (`detected`, `downloadedToSpool`, `rawSkipped`, `disconnected`, `error`).

Notes

- Disk retention and UI retention are intentionally separated: dropping items from the in-memory UI list does not delete spool files.
- Future sinks (upload queue, photo library) should consume `fileURL` rather than raw `Data`.
