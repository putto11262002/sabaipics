Date: 2026-02-12

Context

- Add deterministic tests around iOS upload queue + background uploads without changing runtime behavior.
- Prefer real SQLite for the queue store while faking network/connectivity/background session/time.

Changes

- Added small protocols for UploadManager dependencies to support DI in tests.
  - `apps/studio/FrameFast/Services/UploadManagerProtocols.swift`
- Added a test-only initializer to UploadManager and injected time/sleep helpers.
  - `apps/studio/FrameFast/Services/UploadManager.swift`
- Added reducer unit tests and SQLite-backed integration tests for UploadManager.
  - `apps/studio/FrameFastTests/UploadJobReducerTests.swift`
  - `apps/studio/FrameFastTests/UploadManagerSQLiteIntegrationTests.swift`
- Added test doubles (API client, connectivity, background upload session, clock helpers).
  - `apps/studio/FrameFastTests/UploadManagerTestDoubles.swift`
- Added a shared Xcode scheme so CI/CLI can run `xcodebuild test` reliably.
  - `apps/studio/FrameFast.xcodeproj/xcshareddata/xcschemes/FrameFast.xcscheme`

Notes

- Tests pass via `xcodebuild test -project apps/studio/FrameFast.xcodeproj -scheme FrameFast ...`.
- Background session fake avoids Swift 6 strict-concurrency warnings by using a serial DispatchQueue instead of NSLock in async contexts.
