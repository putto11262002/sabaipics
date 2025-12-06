# Use Cases

**Status:** Draft
**Last Updated:** 2025-12-03

---

## Actors

| Actor | Description |
|-------|-------------|
| **Photographer** | Paying customer. Creates events, uploads photos, manages gallery settings. |
| **Participant** | Event attendee. Searches for their photos, downloads or receives via LINE. |
| **System** | Background processes: image processing, face indexing, notifications, cleanup. |

---

## Photographer Use Cases

### P1: Sign Up / Sign In

**Goal:** Access the platform to manage events and photos.

**Trigger:** Photographer visits dashboard or downloads desktop app.

**Auth methods:** Google, LINE, or Email OTP (passwordless).

**Postcondition:** Photographer has account, can access dashboard.

---

### P2: Purchase Credits

**Goal:** Get credits to upload photos.

**Trigger:** Photographer needs credits (new user, low balance, or preparing for event).

**Packages:**
- STARTER: 500 credits for ฿150
- PROFESSIONAL: 2,000 credits for ฿450
- STUDIO: 5,000 credits for ฿1,000
- Enterprise: Contact sales

**Postcondition:** Credits added to account (expire in 6 months).

---

### P3: Create Event

**Goal:** Set up a new event/project for photo distribution.

**Inputs:**
- Event name (required)
- Start datetime (required)
- End datetime (required)
- Description (optional)
- Location (optional)

**Initial state:** `draft`

**Postcondition:** Event created, photographer can configure settings.

---

### P4: Configure Event Settings

**Goal:** Customize gallery appearance and behavior.

**Settings:**
- Logo upload
- Watermark upload
- Gallery theme (colors, layout)
- Language (Thai/English)
- Download settings (quality)

**Constraint:** Can configure anytime while event exists.

---

### P5: Publish Event

**Goal:** Make event accessible to participants.

**Precondition:** Event is in `draft` status.

**Action:** Toggle status to `published`.

**Postcondition:**
- Event visible (if accessed via QR/link)
- Can create access codes (QR, links)

---

### P6: Create Access Code (QR / Link)

**Goal:** Generate ways for participants to access the event gallery.

**Precondition:** Event is `published`.

**Options:**
- QR code (generates image)
- Shareable link

**Optional restrictions:**
- Access PIN/password
- Max uses
- Expiry datetime

**Postcondition:** Unique code generated, can be shared with participants.

---

### P7: Upload Photos

**Goal:** Add event photos for face indexing and distribution.

**Upload methods:**
- Web upload (browser)
- Desktop app (folder monitoring)
- FTP endpoint (pro cameras)
- Lightroom plugin

**Preconditions:**
- Event is `published`
- Current time is between event `start_datetime` and `end_datetime`
- Photographer has sufficient credits

**Flow:**
1. Photo received
2. 1 credit deducted immediately
3. Photo enters processing pipeline
4. Face detection + indexing
5. Photo becomes searchable

**Postcondition:** Photo indexed, searchable by participants.

---

### P8: View Event Dashboard

**Goal:** Monitor event progress and stats.

**Shows:**
- Photo count
- Face count
- Search count
- Credit usage
- Recent activity

---

### P9: Delete Event

**Goal:** Remove event and all associated data.

**Action:** Soft delete (recoverable for 7 days), then hard delete.

**Deletes:**
- Event record
- All photos (R2)
- All faces
- Rekognition collection
- Search history

---

### P10: Manage Account Settings

**Goal:** Update profile and preferences.

**Settings:**
- Display name
- Business name
- Email (for receipts)
- Language preference
- Notification preferences

---

## Participant Use Cases

### U1: Access Event Gallery

**Goal:** View an event's photo gallery.

**Trigger:** Scan QR code or click shared link.

**Flow:**
1. QR/link contains access code
2. If access PIN required, prompt for it
3. Show gallery landing page

**No login required.**

---

### U2: Search Photos by Face (Web)

**Goal:** Find photos containing their face.

**Preconditions:**
- Event is `published`
- Event has not expired (within 1 month of start)

**Flow:**
1. Take selfie or upload photo
2. System searches Rekognition collection
3. Display matching photos

**No login required.**

**Postcondition:** Participant sees their photos.

---

### U3: Download Photos (Web)

**Goal:** Save matched photos to device.

**Preconditions:**
- Event not expired
- Photos matched from search

**Flow:**
1. Select photos (or select all)
2. Download as ZIP or individual files

**No login required. Free for MVP.**

---

### U4: Receive Photos via LINE

**Goal:** Get matched photos sent directly to LINE chat.

**Preconditions:**
- Event not expired
- Participant has LINE app

**Two requirements (VERIFIED - matches Pixid flow):**
1. Must sign in with LINE (we get `userId`)
2. Must be friend of our LINE OA (otherwise push silently fails)

**Flow (new user):**
1. Search for photos on web
2. Click "ส่งรูปผ่าน Line" (Send via LINE)
3. Redirect to Clerk LINE Login with `bot_prompt=aggressive`
4. User sees consent screen with "Add friend" checkbox
5. User approves + adds friend
6. Redirect back to our app
7. Click "Send via LINE" again
8. Photos sent to LINE chat

**Flow (returning user - already logged in + friend):**
1. Click "ส่งรูปผ่าน Line"
2. Photos sent immediately

**Auth method:** LINE only (no Google/Email for participants).

**Requires:** LINE Login + OA friend (both required).

---

## System Use Cases

### S1: Process Uploaded Photo

**Trigger:** Photo uploaded via any method.

**Flow:**
1. Validate file (type, size, format)
2. Extract EXIF metadata
3. Generate R2 key, store original
4. Call Rekognition DetectFaces
5. For each face: IndexFaces to event's collection
6. Update photo status to `ready`
7. Update event stats (photo_count, face_count)
8. Notify photographer (real-time via WebSocket) → See `06_websocket.md`

**On failure:** Photo status = `failed`, log error.

---

### S2: Search Faces

**Trigger:** Participant submits selfie.

**Flow:**
1. Receive selfie image
2. Call Rekognition SearchFacesByImage on event's collection
3. Get matching face IDs + similarity scores
4. Lookup photos containing those faces
5. Return photo list sorted by similarity
6. Log search session

---

### S3: Send LINE Notification

→ See `06_line_messaging.md` for integration pattern

**Trigger:** Participant requests LINE delivery.

**Preconditions:**
- Participant linked to LINE
- Participant is OA friend (`line_linked=true`)

**Flow:**
1. Get matched photos (max 10 for carousel)
2. Build LINE Image Carousel
3. Call LINE Messaging API push endpoint
4. Log notification in `line_notifications` table

---

### S4: Expire Event Data

**Trigger:** Daily cron job.

**Flow:**
1. Find events where `start_datetime + 1 month < NOW()`
2. For each expired event:
   - Delete Rekognition collection
   - Delete R2 objects (photos)
   - Delete face records
   - Delete search records
   - Mark event as expired (keep record for history)

---

### S5: Expire Credits

**Trigger:** Daily cron job.

**Flow:**
1. Find credit_ledger entries where `expires_at < NOW()` and not yet expired
2. For each expiring batch:
   - Calculate remaining balance from that batch
   - Create `expired` ledger entry (negative amount)
   - Update balance_after

**FIFO:** Oldest credits consumed first when using.

---

### S6: Low Credit Alert

**Trigger:** After photo upload when balance drops below threshold.

**Flow:**
1. Check photographer's credit balance
2. If below threshold (default: 50 credits)
3. Send notification (email or LINE based on preference)

---

## Use Case Summary Table

| ID | Actor | Use Case | MVP | Auth Required |
|----|-------|----------|-----|---------------|
| P1 | Photographer | Sign Up / Sign In | ✅ | Yes |
| P2 | Photographer | Purchase Credits | ✅ | Yes |
| P3 | Photographer | Create Event | ✅ | Yes |
| P4 | Photographer | Configure Event Settings | ✅ | Yes |
| P5 | Photographer | Publish Event | ✅ | Yes |
| P6 | Photographer | Create Access Code | ✅ | Yes |
| P7 | Photographer | Upload Photos | ✅ | Yes |
| P8 | Photographer | View Event Dashboard | ✅ | Yes |
| P9 | Photographer | Delete Event | ✅ | Yes |
| P10 | Photographer | Manage Account Settings | ✅ | Yes |
| U1 | Participant | Access Event Gallery | ✅ | No |
| U2 | Participant | Search Photos by Face | ✅ | No |
| U3 | Participant | Download Photos | ✅ | No |
| U4 | Participant | Receive via LINE | ✅ | LINE |
| S1 | System | Process Uploaded Photo | ✅ | - |
| S2 | System | Search Faces | ✅ | - |
| S3 | System | Send LINE Notification | ✅ | - |
| S4 | System | Expire Event Data | ✅ | - |
| S5 | System | Expire Credits | ✅ | - |
| S6 | System | Low Credit Alert | v1.1 | - |

---

## Not in MVP

| Use Case | Reason | Target |
|----------|--------|--------|
| Photo purchase (participant buys) | Defer until PMF | v2 |
| Team/agency management | Complexity | v2 |
| AI quality filter (blur detection) | Quick win post-launch | v1.1 |
| Analytics dashboard | Post-launch | v1.1 |
