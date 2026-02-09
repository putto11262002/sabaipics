# Desktop Uploader MVP PRD (Draft)

**Product:** Desktop Uploader MVP  
**Goal:** Make it effortless and reliable for photographers to sync a folder of photos to an event.

## Problem
- Manual upload is slow and error-prone.
- Competitors offer desktop sync; we need parity.

## MVP Scope
- Login + event selection
- Create a folder -> event sync mapping
- Background auto-upload of new files
- Basic status + retry visibility
- Tray menu: pause/resume, open app

## Non-Goals (MVP)
- Multiple folders per event
- Advanced filters/edits/metadata
- Team or multi-user devices
- Full upload analytics dashboard

## Primary User Flow
1. Sign in
2. Select event
3. Choose folder
4. Background sync starts
5. User sees status + failures
6. Tray controls for pause/resume

## Key Screens
- Home: stats + recent activity + link to Syncs
- Syncs: list of mappings + add/pause/remove
- Activity: filter by status; retry per item or "retry all failed"
- Settings: auth + basic preferences (optional MVP)

## Background Behavior
- App runs in the background after setup
- Tray menu always available for quick control
- Paused mappings stop new uploads but keep history

## Validation Strategy
- Desktop first-pass validation (fast): file extension, size, file stability (no longer growing)
- Server validation is authoritative: type, dimensions, credits, upload window, etc.
- Desktop surfaces API errors as "needs action"

## Functional Requirements
- Watch folder; upload new/changed files
- Ignore patterns (default: system files)
- Allowed file types (jpg/png/heic default)
- Auto-retry transient failures (3x backoff)
- Manual retry for failed items
- Stable auth (token storage)

## Success Metrics
- Time to first upload < 3 minutes
- Upload success rate > 98%
- < 1% duplicate uploads
- 70% of active users create at least 1 sync mapping

## Risks
- Large file handling + flaky networks
- Duplicate upload prevention
- Token expiration / auth failures
