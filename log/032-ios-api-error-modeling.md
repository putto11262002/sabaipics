# 032 - iOS API Error Modeling (Typed ApiErrorCode)

Goal: align the iOS client error model with the API's standard error envelope and error code set.

## Changes

- Added a typed `ApiErrorCode` enum mirroring `apps/api/src/lib/error/index.ts`.
- Updated `UploadsAPIClient` to decode `{ error: { code, message } }` into `ApiErrorCode`.
- Refactored `UploadsAPIError` to separate:
  - transport failures (no HTTP response)
  - API envelope errors (HTTP non-2xx with `code` + optional `Retry-After`)
  - decoding failures
- Updated `UploadManager` retry classification to use typed codes and `Retry-After`.
