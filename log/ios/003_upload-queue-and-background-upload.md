# iOS Studio - Upload Queue + Background Upload Plan

Date: 2026-01-21

## Goal

Implement an offline-first photo upload pipeline in the iOS Studio app (`apps/studio`) that:

- Persists captured photos to disk
- Enqueues upload jobs durably
- Uploads bytes to storage using background `URLSession`
- Polls server processing completion (so the device knows when it is safe to delete local files)
- Limits concurrent uploads

This plan assumes auth + consent + event selection gates are implemented first.

## Backend Dependencies

We can scaffold much of the iOS-side architecture immediately, but full correctness depends on:

- `SAB-47`: batch polling upload intent status
  - `GET /uploads/status?ids=<uuid>,<uuid>,...` (omit unknown/not-owned IDs)
  - response includes terminal states + `photoId` when completed
- `SAB-48`: re-presign + idempotent retries
  - allow refreshing presigned URL for an existing `uploadId`
  - guarantee no duplicate photo and no double-charge per `uploadId`

## High-Level Data Flow

1) PTP/IP downloads photo bytes into the app
2) Write bytes to disk (atomic write) and create a durable upload job
3) Call API to create a presigned upload intent
4) Upload file bytes directly to storage via background `URLSession` uploadTask(fromFile:)
5) Poll `GET /uploads/status` until server reports `completed` (or terminal failure)
6) Delete local file after server completion

## Disk Writes (Correctness: avoid partial files)

Background URLSession reads from a file URL. We must ensure the file is fully written before creating/resuming an upload task.

Rule:
- Always write to disk atomically, and only enqueue/start upload after the final path exists.

Recommended implementation:
- Use `Data.write(to:options: [.atomic])` OR write to a temporary filename and then rename/move to the final path.

Outcome:
- The final file path appears only after the full contents are on disk.
- Upload tasks never observe partially written files.

## Upload Job Model (Local)

Each captured photo creates one `UploadJob` record.

Required fields:
- `localId` (UUID): stable local identifier (primary key)
- `eventId` (UUID): selected event destination
- `fileURL` (String): absolute path to staged file in app sandbox
- `contentType` (String): typically `image/jpeg`
- `contentLength` (Int): bytes

Server-derived fields (nullable until known):
- `uploadId` (UUID?) returned by `POST /uploads/presign`
- `putUrl` (String?)
- `requiredHeaders` (JSON?)
- `presignExpiresAt` (Date?)

Progress + retry fields:
- `state` (enum; see below)
- `attemptCount` (Int)
- `nextAttemptAt` (Date?)
- `lastError` (String?)
- `createdAt`, `updatedAt` (Date)

## Upload Job State Machine

Minimal set of states:

- `staged`: file exists and is ready to request a presign
- `presigned`: has `{ uploadId, putUrl, requiredHeaders, expiresAt }`
- `uploading`: background upload task is active
- `uploadedAwaitingProcessing`: PUT finished; server processing pending
- `completed(photoId)`: server finalized; safe to delete local file
- `failedRetryable`: transient failure; retryable after backoff
- `failedPermanent`: unrecoverable; user action required

Transitions:
- `staged` -> `presigned` (POST /uploads/presign)
- `presigned` -> `uploading` (create background upload task and resume)
- `uploading` -> `uploadedAwaitingProcessing` (task completes successfully)
- `uploadedAwaitingProcessing` -> `completed` (polling returns completed + photoId)
- any -> `failedRetryable` (timeouts, offline, transient server errors)
- any -> `failedPermanent` (invalid file, event expired, etc.)

## Concurrency Control

We must limit the number of simultaneous background upload tasks.

Approach:
- Enforce concurrency at the app layer using a scheduler, not by relying solely on URLSession.

Default limits (tunable):
- Wi-Fi: 3 concurrent uploads
- Cellular: 2 concurrent uploads
- Constrained network (Low Data Mode): 0 (unless user explicitly opts in)

Implementation details:
- Use `NWPathMonitor` to determine current path characteristics (`isExpensive`, `isConstrained`).
- Before starting new tasks, reconcile existing background tasks (`getAllTasks`) and count active uploads.

## Background URLSession Design

Use a single background session with a stable identifier, e.g.

- `com.sabaipics.studio.uploads`

Rules:
- Always recreate the session with the same identifier on app launch.
- Upload tasks must be created using `uploadTask(with:fromFile:)` (file-based).
- Set `URLSessionTask.taskDescription = localId.uuidString` to map callbacks to jobs.

Relaunch handling:
- Implement `UIApplicationDelegate.application(_:handleEventsForBackgroundURLSession:completionHandler:)`.
- Call the completion handler after `urlSessionDidFinishEvents(forBackgroundURLSession:)`.

## Upload Scheduler (Orchestrator)

Implement a single orchestrator (actor or @MainActor object) responsible for:

- Choosing which jobs to run
- Presigning jobs that need it
- Starting upload tasks up to `maxConcurrent`
- Handling task completion callbacks and updating job states
- Running polling ticks to move jobs to `completed` when server finishes processing

Suggested responsibilities:

1) Reconcile tasks
- `getAllTasks` and map `taskDescription` to local jobs

2) Fill the concurrency window
- Start the next eligible jobs in priority order:
  - `presigned` then `staged` then `failedRetryable` (when `nextAttemptAt <= now`)

3) Poll processing completion
- Periodically call `GET /uploads/status?ids=...` for jobs in `uploadedAwaitingProcessing`.
- Omit unknown/not-owned IDs from the response (server behavior).

4) Cleanup
- When job becomes `completed`, delete local file (or mark for TTL deletion).

## Integration Points in Studio App

### Event destination

Uploads require a selected `eventId`.

- Store `selectedEventId` after event selection gate.
- Transfer session reads the current event id and attaches it to each new job.

### TransferSession hook

In `apps/studio/SabaiPicsStudio/Stores/TransferSession.swift`, in:

- `session(_:didDownloadPhoto:data:objectHandle:)`

Add:
- write photo bytes to disk atomically
- enqueue `UploadJob(staged)`
- trigger scheduler `kick()`

Important:
- Do not block PTP event handling on network calls.

### UI

In `LiveCaptureView`:

- Show selected event name in the header
- Show a small sync HUD:
  - queued / uploading / failed counts
  - last error message (optional)

Default policy:
- Lock event selection for the duration of a transfer session.

## Error Handling Notes

- Presign can fail due to:
  - expired event
  - insufficient credits
  - auth/consent missing
- Storage upload can fail due to:
  - offline
  - timeout
  - presign expired
  - object already exists (depends on server headers like `If-None-Match: *`)
- Server processing can fail after upload due to:
  - invalid file magic bytes
  - normalization errors
  - insufficient credits at processing time

All failures should be represented as either retryable (auto) or permanent (user action).

## References (Official)

Apple:
- Background URLSession guide: https://developer.apple.com/documentation/foundation/downloading-files-in-the-background
- Background session configuration: https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background(withidentifier:)
- handleEventsForBackgroundURLSession: https://developer.apple.com/documentation/uikit/uiapplicationdelegate/application(_:handleeventsforbackgroundurlsession:completionhandler:)
- URLSessionTask.taskDescription: https://developer.apple.com/documentation/foundation/urlsessiontask/taskdescription
- NWPathMonitor: https://developer.apple.com/documentation/network/nwpathmonitor

Backend tracking:
- `SAB-47`: batch polling upload intent status
- `SAB-48`: re-presign + idempotent retries
