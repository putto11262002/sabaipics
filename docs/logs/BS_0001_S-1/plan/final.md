# Execution Plan (Final)

**Status:** Approved
**Finalized:** 2026-01-09

Execution root: `BS_0001_S-1`
Upstream (PM): slice `d999677d-0b51-4b3b-b163-eec36a5bdde3` (S-1: Photographer Onboarding & Photo Upload)
Date: `2026-01-09`
Owner: Tech Lead (AI-assisted)

## Inputs
- Upstream (PM): `product slice show --id d999677d-0b51-4b3b-b163-eec36a5bdde3`
- Context reports: `docs/logs/BS_0001_S-1/context/*.md`
- Research: `docs/logs/BS_0001_S-1/research/*.md`
- Decisions: `docs/logs/BS_0001_S-1/decisions-input.md`

---

## All Decisions (v1 → v4)

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Session timeout | 24 hours |
| 2 | Image format handling | Normalize to JPEG (4000px max width) |
| 3 | Credit packages | Store in DB (admin-editable) |
| 4 | User type verification | Not needed — only photographers sign up |
| 5 | Thumbnails | CF Images on-demand (400px / 1200px) |
| 6 | Face-aware cropping | Out of scope |
| 7 | QR codes | Eager generation, two URLs |
| 8 | PromptPay | Enabled |
| 9 | Credit expiration | 6 months from purchase |
| 10 | Clerk email | Required (LINE permission applied) |
| 11 | Credit packages UI | Dedicated page |
| 12 | Rekognition collection | Create on first upload |
| 13 | Credit deduction | After validation, no refund |
| 14 | Data retention | Keep forever (photos, DB); delete Rekognition collection after 30 days |
| 15 | Storage strategy | Normalized JPEG only (no original) |
| 16 | Accepted formats | JPEG, PNG, HEIC, WebP (no RAW) |
| 17 | Max upload size | 20 MB |
| 18 | Rekognition response | Store full response (JSONB) for model training |
| 19 | Credit ledger | Append-only with FIFO expiry inheritance |

---

## Architecture Overview

### Storage Strategy (Normalized)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Upload Flow                              │
│                                                                 │
│  User uploads          Normalize              Store             │
│  JPEG/PNG/HEIC/WebP ──► to JPEG ──────────► R2 Bucket          │
│  (≤ 20MB)              4000px max            (normalized.jpg)   │
│                        quality 90%                              │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
    │ Web Display │   │  Rekognition │   │   Download   │
    │ CF Images   │   │  IndexFaces  │   │   (4000px)   │
    │ 400/1200px  │   │  (direct)    │   │              │
    └─────────────┘   └──────────────┘   └──────────────┘
```

**Key points:**
- ONE file per photo: normalized JPEG (4000px max, ~1-3MB)
- All formats converted on upload (not on-demand)
- Rekognition receives stored JPEG directly (no conversion needed)
- CF Images handles thumbnails/previews on-demand
- Download serves the normalized JPEG (high quality, not original)

### Upload Validation

| Check | Limit |
|-------|-------|
| Formats | JPEG, PNG, HEIC, WebP |
| Max size | 20 MB |
| Auth | Valid photographer, owns event |
| Event | Not expired |
| Credits | Balance ≥ 1 |

**Rejected:**
- RAW files (CR2, NEF, ARW) — not supported
- Files > 20MB — too large
- Unsupported formats — error message lists accepted formats

### Credit Deduction Flow

```
Upload Request
     │
     ▼
┌─────────────┐
│ Validation  │ ◄── Format, size, auth, credits check
└─────────────┘
     │
     ├── FAIL → 400 error, NO credit deducted
     │
     ▼ PASS
┌─────────────┐
│ Deduct 1    │ ◄── Credit charged HERE (FIFO expiry)
│ Credit      │
└─────────────┘
     │
     ▼
┌─────────────┐
│ Normalize   │ ◄── Convert to JPEG, 4000px max
│ Image       │
└─────────────┘
     │
     ▼
┌─────────────┐
│ Upload to   │
│ R2          │
└─────────────┘
     │
     ▼
┌─────────────┐
│ Queue for   │
│ Face Index  │
└─────────────┘
     │
     ▼
Done (no refund on any failure after deduction)
```

### Credit Ledger Mechanics

**Model:** Append-only ledger with FIFO expiry inheritance.

**Table structure:**
```
| amount | type     | expires_at | created_at |
|--------|----------|------------|------------|
| +100   | purchase | 2026-07-09 | 2026-01-09 |  ← Buy 100, expires in 6 months
| -1     | upload   | 2026-07-09 | 2026-01-10 |  ← Deduction inherits expiry
| -1     | upload   | 2026-07-09 | 2026-01-10 |
| +50    | purchase | 2026-07-15 | 2026-01-15 |  ← Another purchase
| -1     | upload   | 2026-07-09 | 2026-01-16 |  ← Still uses oldest expiry
```

**Balance calculation:**
```sql
SELECT SUM(amount)
FROM credit_ledger
WHERE photographer_id = ?
  AND expires_at > NOW()
```

**Deduction insert (FIFO expiry):**
```sql
INSERT INTO credit_ledger (photographer_id, amount, type, expires_at)
VALUES (
  :photographer_id,
  -1,
  'upload',
  (SELECT expires_at FROM credit_ledger
   WHERE photographer_id = :photographer_id
     AND amount > 0
     AND expires_at > NOW()
   ORDER BY expires_at ASC
   LIMIT 1)
);
```

**Why FIFO expiry?**
- Deductions expire with their "source" purchase
- Prevents negative balance after purchases expire
- Simple balance query (just SUM unexpired rows)

---

## Database Schema

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `photographers` | id, clerk_id, email, name, pdpa_consent_at, created_at | Email required |
| `credit_packages` | id, name, credits, price_thb, active, sort_order | Admin-editable |
| `credit_ledger` | id, photographer_id, amount, type, stripe_session_id, expires_at, created_at | 6-month expiry |
| `events` | id, photographer_id, name, start_date, end_date, access_code, qr_code_r2_key, rekognition_collection_id, expires_at, created_at | Collection nullable |
| `photos` | id, event_id, r2_key, status, face_count, uploaded_at | Single r2_key (normalized JPEG) |
| `faces` | id, photo_id, rekognition_face_id, bounding_box, rekognition_response (JSONB), indexed_at | Full response for model training |
| `consent_records` | id, photographer_id, consent_type, granted_at, ip_address | PDPA compliance |

---

## Phase 0: Foundation

| Task | Surface | Description |
|------|---------|-------------|
| 0.1 | DB | Create all tables via Drizzle migrations |
| 0.2 | API | `requirePhotographer()` middleware |
| 0.3 | API | Admin endpoints: `GET/POST/PATCH /admin/credit-packages` |
| 0.4 | Config | Clerk: require email, 24h session |
| 0.5 | Config | LINE: Apply for email permission |
| 0.6 | Infra | R2 lifecycle rule: delete QR codes after 30 days |
| 0.7 | Cron | Job to delete Rekognition collections 30 days after event created |

---

## Phase 1: Auth (US-1, US-2)

### US-1: Photographer signup

| Step | Surface | Action |
|------|---------|--------|
| 1 | UI | User visits `/photographer/signup` |
| 2 | UI | Clicks Google/LINE/email |
| 3 | External | Clerk handles OAuth/email |
| 4 | External | If LINE doesn't provide email → Clerk prompts |
| 5 | Webhook | `user.created` → create `photographers` row |
| 6 | UI | PDPA consent modal (blocking) |
| 7 | API | `POST /consent` records consent |
| 8 | UI | Redirect to dashboard |

### US-2: Session persistence

24-hour sessions with Clerk auto-refresh. No custom logic needed.

---

## Phase 2: Dashboard (US-3, US-4)

### US-3: Dashboard display

| Step | Surface | Action |
|------|---------|--------|
| 1 | UI | Dashboard loads |
| 2 | API | `GET /dashboard` |
| 3 | UI | Show credit balance, event list, CTAs |

**API:**
```
GET /dashboard
Response: {
  credits: { balance, nearestExpiry? },
  events: [{ id, name, photoCount, faceCount, createdAt }],
  stats: { totalPhotos, totalFaces }
}
```

### US-4: Credit purchase

| Step | Surface | Action |
|------|---------|--------|
| 1 | UI | Click "Buy Credits" → navigate to `/credits/packages` |
| 2 | API | `GET /credit-packages` |
| 3 | UI | Select package |
| 4 | API | `POST /credits/checkout` |
| 5 | External | Stripe Checkout (PromptPay enabled) |
| 6 | Webhook | `checkout.session.completed` → insert credit_ledger |
| 7 | UI | Success → dashboard with updated balance |

**Credit expiry:** `expires_at = NOW() + 6 months`

---

## Phase 3: Events (US-5, US-6)

### US-5: Create event

| Step | Surface | Action |
|------|---------|--------|
| 1 | UI | Click "Create Event" → modal |
| 2 | UI | Enter name, optional dates |
| 3 | API | `POST /events` |
| 4 | API | Generate `access_code` (6-char) |
| 5 | API | Generate QR PNG with 2 URLs |
| 6 | API | Upload QR to R2 |
| 7 | DB | Insert event (rekognition_collection_id = NULL) |
| 8 | DB | Set `expires_at = created_at + 30 days` |
| 9 | UI | Show event card with QR |

**QR encodes:**
```
Search:    https://sabaipics.com/search/{accessCode}
Slideshow: https://sabaipics.com/event/{accessCode}/slideshow
```

### US-6: QR display/download

| Step | Surface | Action |
|------|---------|--------|
| 1 | UI | Event card shows QR + both URLs |
| 2 | UI | "Download QR" → fetch from R2 |

---

## Phase 4: Upload & Face Detection (US-7, US-8, US-9)

### US-7: Photo upload

| Step | Surface | Action |
|------|---------|--------|
| 1 | UI | Drag photos or file picker |
| 2 | UI | Client validation: format, size ≤ 20MB |
| 3 | API | `POST /events/:id/photos` |
| 4 | API | Server validation |
| 5 | API | Check credits ≥ 1 |
| 6 | API | **Deduct 1 credit** |
| 7 | API | Normalize: convert to JPEG, max 4000px, quality 90% |
| 8 | API | Stream normalized JPEG to R2 |
| 9 | DB | Insert `photos` row: `status=processing` |
| 10 | Queue | Enqueue face detection job |
| 11 | UI | Show "Processing..." badge |

**API:**
```
POST /events/:id/photos
Body: multipart/form-data (file)
Response: { photoId, status: "processing" }
```

**Validation errors:**
| Error | Message |
|-------|---------|
| Wrong format | "Accepted formats: JPEG, PNG, HEIC, WebP" |
| Too large | "Maximum file size is 20MB" |
| No credits | "Insufficient credits. Purchase more to continue." |
| Event expired | "This event has expired" |

### US-8: Face detection

| Step | Surface | Action |
|------|---------|--------|
| 1 | Queue | Dequeue job |
| 2 | Queue | Check `events.rekognition_collection_id` |
| 3 | Queue | **If NULL:** Create collection, save ID |
| 4 | Queue | Fetch normalized JPEG from R2 |
| 5 | Queue | Call Rekognition `IndexFaces` (direct, no conversion needed) |
| 6 | DB | Insert `faces` rows with full Rekognition response (JSONB) |
| 7 | DB | Update `photos`: `status=indexed`, `face_count=N` |

**No conversion needed:** Stored file is already JPEG, guaranteed < 5MB.

**Rekognition response stored (JSONB):**
- Bounding box
- Confidence score
- Landmarks (eyes, nose, mouth positions)
- Quality metrics (brightness, sharpness)
- Pose (pitch, roll, yaw)
- Face ID (for search while collection exists)

### US-9: Gallery display

| Step | Surface | Action |
|------|---------|--------|
| 1 | UI | Open event detail |
| 2 | API | `GET /events/:id/photos?cursor=X&limit=50` |
| 3 | UI | Grid with CF Images thumbnails (400px) |
| 4 | UI | Click → lightbox (1200px preview) |
| 5 | UI | Download → presigned R2 URL (4000px JPEG) |

**URLs:**
```
Thumbnail: /cdn-cgi/image/width=400,fit=cover,format=auto/photos.sabaipics.com/{r2_key}
Preview:   /cdn-cgi/image/width=1200,fit=contain,format=auto/photos.sabaipics.com/{r2_key}
Download:  Presigned R2 URL (normalized JPEG, ~4000px)
```

---

## Data Retention & Cleanup

| Data | Retention | Mechanism |
|------|-----------|-----------|
| Events (DB) | **Forever** | — |
| Photos (R2) | **Forever** | — (for model training) |
| Photos (DB) | **Forever** | — |
| Faces (DB) | **Forever** | Full Rekognition response stored |
| QR codes (R2) | **30 days** | R2 lifecycle rule (not needed for training) |
| Rekognition collection | **30 days** after event created | Cron job → DeleteCollection |

**Rationale:**
- Keep photos and face data for model training
- Delete QR codes after 30 days (not useful for training)
- Delete Rekognition collection (expensive to maintain)
- After 30 days: gallery works, face counts visible, but selfie search disabled

---

## API Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /consent | Record PDPA consent |
| GET | /dashboard | Dashboard data |
| GET | /credit-packages | List packages |
| POST | /credits/checkout | Create Stripe session |
| POST | /events | Create event |
| GET | /events | List events |
| GET | /events/:id | Event detail |
| POST | /events/:id/photos | Upload photo |
| GET | /events/:id/photos | List photos (paginated) |
| GET | /admin/credit-packages | Admin: list packages |
| POST | /admin/credit-packages | Admin: create package |
| PATCH | /admin/credit-packages/:id | Admin: update package |

---

## Sequencing

```
Phase 0 (Foundation)
  ├─ DB: All tables
  ├─ API: requirePhotographer middleware
  ├─ API: Admin credit-packages CRUD
  └─ Config: Clerk (email, 24h), LINE email permission
       │
Phase 1 (Auth)
  ├─ API: POST /consent, Clerk webhook
  └─ UI: Signup, PDPA modal
       │
Phase 2 (Dashboard)
  ├─ API: GET /dashboard, GET /credit-packages, POST /credits/checkout
  ├─ Webhook: Stripe handler
  └─ UI: Dashboard, /credits/packages page
       │
Phase 3 (Events)
  ├─ API: POST /events, GET /events, GET /events/:id
  ├─ Lib: QR generation (2 URLs)
  └─ UI: Event CRUD, QR display
       │
Phase 4 (Upload)
  ├─ API: POST /events/:id/photos (validate + deduct + normalize + store)
  ├─ API: GET /events/:id/photos
  ├─ Queue: Lazy collection + IndexFaces
  └─ UI: Upload dropzone, gallery
       │
Cleanup (Cron)
  └─ Job: Delete Rekognition collections after 30 days (keep photos + DB)
```

---

## Success Path

1. Photographer signs up via LINE
2. Clerk prompts for email (LINE didn't provide)
3. Accepts PDPA consent
4. Lands on dashboard (0 credits)
5. Goes to `/credits/packages`, buys 100 credits via PromptPay
6. Creates "Wedding 2026-01-15" event
7. Gets QR with search + slideshow URLs
8. Uploads 50 photos (HEIC from iPhone)
9. Each: validate → deduct credit → normalize to JPEG → store → queue
10. First photo: create Rekognition collection
11. All photos: IndexFaces (already JPEG, no conversion)
12. Views gallery with thumbnails (fast, CDN cached)
13. Downloads photo (4000px JPEG)
14. 30 days later: Rekognition collection deleted (gallery still works, selfie search disabled)

---

## Tradeoffs & Follow-ups

### Out of scope
- `[OUT_OF_SCOPE]` RAW format support — photographers export JPEG
- `[OUT_OF_SCOPE]` Original file preservation — we normalize, not archive
- `[OUT_OF_SCOPE]` FTP upload (W-3)
- `[OUT_OF_SCOPE]` Slideshow (W-4) — URL exists, shows "Coming soon"
- `[OUT_OF_SCOPE]` Gallery share link (W-7)
- `[OUT_OF_SCOPE]` LINE notifications (W-10)
- `[OUT_OF_SCOPE]` Selfie search (S-2)
- `[OUT_OF_SCOPE]` Face-aware cropping
- `[OUT_OF_SCOPE]` Admin UI for credit packages

### Accepted compromises
- `[ACCEPTED_FOR_NOW]` No chunked/resumable uploads
- `[ACCEPTED_FOR_NOW]` No WebSocket progress
- `[ACCEPTED_FOR_NOW]` 30-day retention fixed

### Risks
- `[RISK]` Normalization in Worker may be slow for large files → async in queue if needed
- `[RISK]` 20MB limit may reject some large PNGs → monitor, increase if needed

### Follow-ups
- `[PM_FOLLOWUP]` Credit package pricing
- `[PM_FOLLOWUP]` PDPA consent copy
- `[PM_FOLLOWUP]` LINE email permission application
- `[ENG_DEBT]` Structured logging
- `[ENG_DEBT]` Component tests
- `[ENG_DEBT]` Admin UI for packages
- `[ENG_DEBT]` RAW support via external processor (if demand)

---

## References
- Research: `docs/logs/BS_0001_S-1/research/*.md`
- Decisions: `docs/logs/BS_0001_S-1/decisions-input.md`
- Upstream: `product slice show --id d999677d-0b51-4b3b-b163-eec36a5bdde3`
