# 030 - iOS Upload Reducer Refactor (No Tests Yet)

Goal: make the upload queue processing easier to reason about and later unit-test by separating pure state-machine decisions from side effects.

## Changes

- Added `UploadJobReducer` (pure) to map a persisted `UploadJobRecord` state to the next set of effects to run.
- Refactored `UploadManager.process(_:)` to:
  - re-fetch the latest job state before making decisions
  - execute a sequence of effects (`ensurePresigned`, `upload`, `checkCompletion`) via a single runner method
  - keep existing retry/backoff/error classification behavior unchanged

## Files

| File                                                    | Change                                           |
| ------------------------------------------------------- | ------------------------------------------------ |
| `apps/studio/FrameFast/Services/UploadJobReducer.swift` | New — pure state machine decision mapping        |
| `apps/studio/FrameFast/Services/UploadManager.swift`    | Use reducer + effect runner inside `process(_:)` |
