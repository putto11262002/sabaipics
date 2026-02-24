# Business Rules

**Status:** Draft
**Last Updated:** 2025-12-03

---

## 1. Credit System

### 1.1 Credit Packages

| Package      | Credits | Price  | Per-Credit | Expiry   |
| ------------ | ------- | ------ | ---------- | -------- |
| STARTER      | 500     | ฿150   | ฿0.30      | 6 months |
| PROFESSIONAL | 2,000   | ฿450   | ฿0.225     | 6 months |
| STUDIO       | 5,000   | ฿1,000 | ฿0.20      | 6 months |
| Enterprise   | Custom  | Custom | Custom     | Custom   |

### 1.2 Credit Expiration

| Credit Type | Expiry Rule                                                |
| ----------- | ---------------------------------------------------------- |
| `purchase`  | 6 months from purchase date                                |
| `bonus`     | Variable, set per promotion (e.g., signup bonus = 1 month) |
| `promo`     | Variable, set per promo code                               |

**Note:** Refunds are NOT supported in MVP. If needed in future, requires consultation on business rules (partial refund? credit-back? cash refund?).

**Rule:** Credits expire at midnight (00:00) Bangkok time on expiry date.

### 1.3 Credit Consumption

**When:** 1 credit is deducted when a photo is uploaded, **before** entering the processing pipeline.

**FIFO Rule:** When consuming credits, deduct from the batch with the **soonest expiry date** first.

**Failed uploads:** Credit is still consumed. No automatic refund.

- Rationale: Cost is incurred (Rekognition call), prevents abuse.
- User action: Re-upload costs another credit.

**Rejected uploads (pre-pipeline):** No credit deducted.

- Invalid file type (not image)
- File too large (> 50MB)
- Event not in upload window

### 1.4 Credit Balance

**Calculation:** Sum of all ledger entries for photographer.

**Low credit threshold:** 50 credits (configurable per photographer).

**Zero balance behavior:** Upload blocked. Prompt to purchase more.

---

## 2. Event Lifecycle

### 2.1 Event Status

| Status      | Meaning                                                    |
| ----------- | ---------------------------------------------------------- |
| `draft`     | Event created but not visible. Cannot create access codes. |
| `published` | Event visible via access codes. Can create QR/links.       |

**Transition:** `draft` → `published` (manual toggle by photographer)

**No reverse:** Once published, cannot go back to draft. Delete and recreate if needed.

### 2.2 Event Time Windows

```
        start_datetime              end_datetime              start + 1 month
             │                           │                           │
─────────────┼───────────────────────────┼───────────────────────────┼─────────
             │                           │                           │
             │◄──── UPLOAD ALLOWED ─────►│                           │
             │                                                       │
             │◄─────── SEARCH/DOWNLOAD ALLOWED ─────────────────────►│
             │                                                       │
             │                                                  EVENT EXPIRES
             │                                                  (data purged)
```

### 2.3 Event Rules

| Rule              | Constraint                                                         |
| ----------------- | ------------------------------------------------------------------ |
| **Upload window** | Only between `start_datetime` and `end_datetime`                   |
| **Search window** | From `start_datetime` until 1 month after `start_datetime`         |
| **Event expiry**  | 1 month after `start_datetime`                                     |
| **After expiry**  | No search, no download, no access. Data purged. Event record kept. |

### 2.4 Event Expiry Actions

When event expires (1 month after start):

1. Delete Rekognition collection
2. Delete all photos from R2
3. Delete face records from database
4. Delete search session records
5. Mark event as expired (keep event record for history/accounting)

**Data preserved after expiry:**

- Event record (name, dates, settings)
- Credit ledger entries (for accounting)
- Payment records

---

## 3. Photo Processing

### 3.1 Upload Validation (Pre-Pipeline)

**Reject immediately (no credit charge):**

| Check          | Rule                                             |
| -------------- | ------------------------------------------------ |
| File type      | Must be JPEG, PNG, HEIC, or WebP                 |
| File size      | Max 50MB                                         |
| Event status   | Must be `published`                              |
| Upload window  | Current time must be between event start and end |
| Credit balance | Must have ≥ 1 credit                             |

### 3.2 Processing Pipeline

**After validation passes:**

1. Deduct 1 credit
2. Store original to R2
3. Extract EXIF metadata
4. Call Rekognition DetectFaces
5. For each face: IndexFaces to collection
6. Update photo status: `pending` → `processing` → `ready`
7. Update event stats
8. Notify photographer (WebSocket)

### 3.3 Photo Status

| Status       | Meaning                            |
| ------------ | ---------------------------------- |
| `pending`    | Uploaded, waiting for processing   |
| `processing` | Currently being processed          |
| `ready`      | Processed successfully, searchable |
| `failed`     | Processing failed, see error       |

### 3.4 Processing Failure

**On failure:**

- Photo status = `failed`
- Store error message in `processing_error`
- Credit NOT refunded
- Photographer notified

**Common failures:**

- Rekognition API error
- No faces detected (still stored, but not searchable)
- Corrupt image file

---

## 4. Face Search

### 4.1 Search Rules

| Rule                    | Constraint                 |
| ----------------------- | -------------------------- |
| Event must be published | Cannot search draft events |
| Event not expired       | Within 1 month of start    |
| Selfie required         | Must provide face image    |

### 4.2 Search Result Ranking

Results sorted by:

1. Similarity score (descending) - from Rekognition
2. Photo upload time (descending) - newer first for ties

### 4.3 Similarity Threshold

**Minimum similarity:** TBD (requires fine-tuning during development)

- AWS Rekognition returns similarity scores 0-100%
- Threshold will be determined through testing with real event photos
- May need to be configurable per event or globally
- Consider showing results with confidence indicators rather than hard cutoff

**TODO:** Fine-tune threshold during development/testing phase.

### 4.4 Search Caching

**Cache key:** `(event_id, participant_face_hash)`

**Cache duration:** Event image lifetime (1 month from event start)

- Cache persists until event expires
- Same participant searching same event returns cached results
- Saves Rekognition API cost on repeat searches

**Benefit:** Significant cost savings for participants who search multiple times.

---

## 5. Access Control

### 5.1 Event Access

| Access Type | Description   |
| ----------- | ------------- |
| `qr`        | QR code image |
| `link`      | Shareable URL |

### 5.2 Access Code Rules

| Field         | Rule                                                  |
| ------------- | ----------------------------------------------------- |
| `code`        | Unique, URL-safe string (e.g., "abc123")              |
| `access_code` | Optional PIN/password. NULL = no password required.   |
| `max_uses`    | Optional limit. NULL = unlimited.                     |
| `expires_at`  | Optional expiry. NULL = never (follows event expiry). |

### 5.3 Access Flow

1. User visits URL or scans QR
2. Lookup access record by `code`
3. Check `is_active` = true
4. Check `expires_at` not passed
5. Check `used_count < max_uses` (if set)
6. If `access_code` set, prompt for PIN
7. Grant access to event

---

## 6. Participant Rules

### 6.1 Authentication Requirements

| Action           | Auth Required                      |
| ---------------- | ---------------------------------- |
| View gallery     | No                                 |
| Search by face   | No                                 |
| Download photos  | No                                 |
| Receive via LINE | LINE Login (via Clerk) + OA friend |

**Participant auth:** LINE only (no Google/Email options).

**Rationale:** Participants need LINE to receive photos anyway, so we only offer LINE Login.

### 6.2 LINE Integration (VERIFIED - matches competitor Pixid flow)

**Two requirements for sending photos via LINE:**

1. **LINE Login** - User must sign in with LINE (we get `userId`)
2. **OA Friend** - User must be friend of our Official Account

**Why both are needed:**

- LINE Login alone gives us `userId` but push messages silently fail if not friend
- Messaging API returns 200 OK but doesn't deliver to non-friends
- No error returned - we must check friendship status ourselves

**Implementation:**

| User State            | line_user_id | line_linked | Can Send?                    |
| --------------------- | ------------ | ----------- | ---------------------------- |
| Not logged in         | NULL         | false       | ❌ No - show LINE Login      |
| Logged in, not friend | set          | false       | ❌ No - prompt to add friend |
| Logged in + friend    | set          | true        | ✅ Yes - send immediately    |

**LINE Login with `bot_prompt`:**

```
https://access.line.me/oauth2/v2.1/authorize?
  ...
  &bot_prompt=aggressive  ← Shows separate screen after consent asking to add friend
```

| bot_prompt   | Behavior                                                             |
| ------------ | -------------------------------------------------------------------- |
| `normal`     | Add friend checkbox on consent screen                                |
| `aggressive` | Separate screen after consent asking to add friend ← **We use this** |

**Updating `line_linked` status:**

- On LINE Login callback: check if user added friend (`friendship_status_changed` param)
- On follow webhook: set `line_linked = true` when user follows OA
- On unfollow webhook: set `line_linked = false` when user blocks/unfollows

**Note:** All auth goes through Clerk. LINE Login is handled by Clerk with `bot_prompt` parameter.

---

## 7. Pricing Rules

### 7.1 All Features Included

**Rule:** All features available at all price tiers. No feature gating.

### 7.2 No Hidden Fees

**Included in credit price:**

- Photo upload
- Face detection & indexing
- Face search (unlimited)
- Photo downloads (unlimited)
- LINE notifications
- QR code generation
- Gallery hosting

### 7.3 Credit Rollover

**Rule:** Unused credits roll over to next purchase (within expiry window).

Example: Buy 500 credits, use 300, buy 500 more = 700 total.

---

## 8. Delivery Tracking

### 8.1 What Counts as Delivery

| Action                    | Delivery? | Type       |
| ------------------------- | --------- | ---------- |
| Download original photo   | Yes       | `download` |
| Send photo via LINE       | Yes       | `line`     |
| View thumbnail in gallery | No        | -          |
| View photo detail         | No        | -          |

### 8.2 Recording Rules

- Record one delivery per photo per action
- Multi-photo LINE send = multiple delivery records (one per photo)
- Anonymous downloads recorded with `participant_id = NULL`

### 8.3 Delivery Analytics (Photographer Dashboard)

Available metrics:

- Total photos delivered per event
- Breakdown by type (download vs LINE)
- Per-photo delivery count
- Delivery timeline

---

## 9. Data Retention

| Data                 | Retention                     | Action                                  |
| -------------------- | ----------------------------- | --------------------------------------- |
| Event photos         | 1 month from event start      | Auto-delete from R2                     |
| Rekognition faces    | 1 month from event start      | Delete collection                       |
| Search sessions      | 90 days                       | Archive/delete                          |
| Event record         | Forever (unless user deletes) | Keep for history                        |
| Credit ledger        | Forever                       | Immutable audit trail                   |
| Payments             | Forever                       | Legal requirement                       |
| Photographer account | Until user deletes            | Soft delete → hard delete after 30 days |

---

## 10. Rate Limits

**Business and operational rate limits:**

| Action                 | Limit                     | Window         | Reason                   |
| ---------------------- | ------------------------- | -------------- | ------------------------ |
| FTP upload             | 20 concurrent connections | Per connection | VPS I/O capacity limit   |
| Access code creation   | 20 codes                  | Per event      | Abuse prevention         |
| LINE messages (global) | 5,000 messages            | Per month      | LINE OA Basic plan quota |

**API endpoint rate limits:** See `dev/tech/03_api_design.md` Critical Decision 9

---

## 11. Validation Rules Summary

### 11.1 Event Validation

```
CREATE EVENT:
  - name: required, max 200 chars
  - start_datetime: required, must be future (or now)
  - end_datetime: required, must be after start_datetime
  - description: optional, max 2000 chars

PUBLISH EVENT:
  - status must be 'draft'
  - start_datetime and end_datetime must be set
```

### 11.2 Photo Upload Validation

```
UPLOAD PHOTO:
  - event.status = 'published'
  - NOW() >= event.start_datetime
  - NOW() <= event.end_datetime
  - photographer.credit_balance >= 1
  - file.type IN ('image/jpeg', 'image/png', 'image/heic', 'image/webp')
  - file.size <= 50MB
```

### 11.3 Search Validation

```
SEARCH:
  - event.status = 'published'
  - NOW() < event.start_datetime + 1 month
  - selfie_image provided
  - selfie contains detectable face
```

### 11.4 Access Code Validation

```
ACCESS EVENT:
  - access.is_active = true
  - access.expires_at IS NULL OR access.expires_at > NOW()
  - access.max_uses IS NULL OR access.used_count < access.max_uses
  - IF access.access_code IS NOT NULL: user must provide matching PIN
  - event.status = 'published'
  - NOW() < event.start_datetime + 1 month
```

---

## 12. Error Codes

| Code                   | Meaning                 | User Message                          |
| ---------------------- | ----------------------- | ------------------------------------- |
| `EVENT_NOT_FOUND`      | Event doesn't exist     | "Event not found"                     |
| `EVENT_NOT_PUBLISHED`  | Event is draft          | "Event not available"                 |
| `EVENT_EXPIRED`        | Past 1 month from start | "Event has expired"                   |
| `EVENT_NOT_STARTED`    | Before start_datetime   | "Event hasn't started yet"            |
| `EVENT_UPLOAD_CLOSED`  | Past end_datetime       | "Upload period has ended"             |
| `INSUFFICIENT_CREDITS` | No credits              | "Please purchase credits to continue" |
| `INVALID_FILE_TYPE`    | Not an image            | "Please upload an image file"         |
| `FILE_TOO_LARGE`       | > 50MB                  | "File too large (max 50MB)"           |
| `NO_FACE_DETECTED`     | Selfie has no face      | "No face detected. Please try again." |
| `ACCESS_CODE_INVALID`  | Code not found          | "Invalid access code"                 |
| `ACCESS_CODE_EXPIRED`  | Code expired            | "This link has expired"               |
| `ACCESS_PIN_REQUIRED`  | Need PIN                | "Please enter the access code"        |
| `ACCESS_PIN_WRONG`     | Wrong PIN               | "Incorrect access code"               |
| `LINE_NOT_LINKED`      | Not OA friend           | "Please add us as a friend on LINE"   |
