# S-1 Task Breakdown

**Slice:** S-1
**Date:** 2026-01-06
**Optimization:** Tasks grouped for parallel execution

---

## Task Overview

| Phase | Tasks | Parallelizable | Dependency |
|-------|-------|----------------|------------|
| 1. Foundation | 2 | Yes (API/UI split) | None |
| 2. Core Features | 3 | Partial | Phase 1 |
| 3. Payment | 2 | Yes | Phase 1 |
| 4. Upload | 2 | Yes (API/UI split) | Phase 2 |
| 5. Integration | 1 | No | Phases 3, 4 |

---

## Phase 1: Foundation

### TASK-1: Database Schema Implementation

**Stories:** US-1, US-2, US-3 (foundation for all)

**Scope:**
- Implement all Drizzle schema files in `packages/db/src/schema/`
- Run migrations
- Export types

**Files to Create:**
```
packages/db/src/schema/
├── photographers.ts
├── events.ts
├── event-access.ts
├── photos.ts
├── faces.ts
├── credit-ledger.ts
├── payments.ts
├── consent-records.ts
└── index.ts (update exports)
```

**Acceptance:**
- [ ] All tables match docs/tech/01_data_schema.md
- [ ] Migrations run successfully
- [ ] Types exported from @sabaipics/db

**Dependencies:** None
**Can Run Parallel With:** TASK-2

---

### TASK-2: Auth Integration (Clerk → DB)

**Stories:** US-1, US-2

**Scope:**
- Update Clerk webhook to write photographer to DB
- Add PDPA consent recording
- Create `/photographers/me` endpoint

**Files to Modify:**
```
apps/api/src/routes/webhooks/clerk.ts  # Add DB writes
apps/api/src/routes/photographers.ts   # New file
apps/api/src/index.ts                  # Add route
```

**Key Logic:**
```typescript
// On user.created webhook:
// 1. Insert into photographers table
// 2. Insert signup consent record
// 3. Return 200

// GET /photographers/me:
// 1. Get auth.userId
// 2. Query photographers by clerk_user_id
// 3. Return profile + credit balance
```

**Acceptance:**
- [ ] New user creates photographer record
- [ ] PDPA consent recorded on signup
- [ ] `/photographers/me` returns profile with credits

**Dependencies:** TASK-1 (schema)
**Can Run Parallel With:** None in Phase 1 (depends on schema)

---

## Phase 2: Core Features

### TASK-3: Dashboard API & UI

**Stories:** US-3

**Scope:**
- API: Get photographer profile, events list
- UI: Dashboard with credits, events, CTAs

**API Endpoints:**
```
GET /photographers/me     # From TASK-2
GET /events               # List events for current photographer
```

**UI Components:**
```
apps/dashboard/src/
├── routes/dashboard/index.tsx  # Update existing
├── components/credits/
│   └── CreditBalance.tsx       # Balance + expiry
├── components/events/
│   └── EventCard.tsx           # Event preview
│   └── EventList.tsx           # Event grid
```

**Acceptance:**
- [ ] Dashboard shows credit balance
- [ ] Dashboard shows event list (or empty state)
- [ ] "Create Event" and "Buy Credits" buttons visible
- [ ] Loads in <2 seconds

**Dependencies:** TASK-2 (auth + profile endpoint)
**Can Run Parallel With:** TASK-4 (event creation)

---

### TASK-4: Event Creation Flow

**Stories:** US-5, US-6

**Scope:**
- API: Create event, generate QR code
- UI: Event creation form, QR display

**API Endpoints:**
```
POST /events              # Create event
GET /events/:id           # Get event details
GET /events/:id/qr        # Generate QR PNG
```

**Backend Logic:**
```typescript
// POST /events:
// 1. Validate request
// 2. Generate unique event code (nanoid)
// 3. Create Rekognition collection
// 4. Insert event record
// 5. Insert default event_access record
// 6. Return event with QR URL

// GET /events/:id/qr:
// 1. Generate QR using @juit/qrcode
// 2. Return PNG with download headers
```

**UI Components:**
```
apps/dashboard/src/
├── routes/events/new.tsx        # Create form
├── routes/events/[id]/index.tsx # Event detail
├── components/events/
│   └── QRCodeDisplay.tsx        # QR viewer + download
```

**New Dependency:**
```bash
pnpm add @juit/qrcode
```

**Acceptance:**
- [ ] Can create event with name (dates optional)
- [ ] Unique event code generated
- [ ] QR code displays and downloads as PNG
- [ ] QR scans correctly to selfie search URL

**Dependencies:** TASK-1 (schema), TASK-2 (auth)
**Can Run Parallel With:** TASK-3 (dashboard)

---

### TASK-5: R2 CORS Configuration

**Stories:** US-7

**Scope:**
- Configure R2 bucket CORS for browser uploads

**Steps:**
1. Create CORS policy JSON
2. Apply via wrangler or dashboard
3. Test with browser PUT request

**CORS Policy:**
```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://app.sabaipics.com",
      "https://app-staging.sabaipics.com"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "x-amz-meta-*"],
    "MaxAgeSeconds": 3600
  }
]
```

**Acceptance:**
- [ ] Browser can PUT to presigned R2 URL
- [ ] No CORS errors in console

**Dependencies:** None (infra task)
**Can Run Parallel With:** All Phase 2 tasks

---

## Phase 3: Payment Flow

### TASK-6: Stripe Integration (Backend)

**Stories:** US-4

**Scope:**
- API: Credit packages, checkout session, webhook
- Credit ledger management

**API Endpoints:**
```
GET /credits/packages     # List packages
POST /credits/purchase    # Create Stripe checkout
POST /webhooks/stripe     # Handle payment
```

**Files:**
```
apps/api/src/routes/
├── credits.ts           # Packages + purchase
├── webhooks/stripe.ts   # Webhook handler
```

**Environment Variables:**
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PUBLISHABLE_KEY
```

**Acceptance:**
- [ ] Packages endpoint returns 3 packages
- [ ] Purchase creates Stripe checkout session
- [ ] Webhook verifies signature
- [ ] Successful payment adds credits to ledger

**Dependencies:** TASK-1 (schema)
**Can Run Parallel With:** TASK-7 (payment UI)

---

### TASK-7: Payment UI

**Stories:** US-4

**Scope:**
- Credits page with package selection
- Redirect to Stripe Checkout
- Success/cancel handling

**UI Components:**
```
apps/dashboard/src/
├── routes/credits/index.tsx  # Package selection
├── components/credits/
│   └── PackageCard.tsx       # Package display
```

**Flow:**
1. Display packages with pricing
2. User clicks "Buy"
3. API returns checkout URL
4. Redirect to Stripe
5. Return to dashboard with success message

**Acceptance:**
- [ ] Shows 3 credit packages
- [ ] Click redirects to Stripe Checkout
- [ ] Success shows confirmation
- [ ] Credits appear in balance

**Dependencies:** TASK-6 (API)
**Can Run Parallel With:** TASK-6 (API development)

---

## Phase 4: Upload Pipeline

### TASK-8: Photo Upload API

**Stories:** US-7, US-8

**Scope:**
- Upload session with presigned URLs
- Confirm uploads and enqueue jobs
- Photo listing

**API Endpoints:**
```
POST /events/:id/photos/upload-session   # Get presigned URLs
POST /events/:id/photos/confirm-uploads  # Confirm + enqueue
GET /events/:id/photos                   # List photos
```

**Key Logic:**
```typescript
// POST upload-session:
// 1. Validate auth, event ownership
// 2. Check credit balance >= file count
// 3. Deduct credits from ledger
// 4. Generate presigned URLs for each file
// 5. Create photo records (status: pending)
// 6. Return session with URLs

// POST confirm-uploads:
// 1. Validate session
// 2. Update photo status to 'uploaded'
// 3. Enqueue PhotoJob for each photo
// 4. Return confirmation
```

**New Dependency:**
```bash
pnpm add aws4fetch  # For presigned URL generation
```

**Acceptance:**
- [ ] Upload session returns presigned URLs
- [ ] Confirm uploads enqueues jobs
- [ ] Photos endpoint returns list with status
- [ ] Credits deducted correctly

**Dependencies:** TASK-1, TASK-4 (events), TASK-5 (CORS)
**Can Run Parallel With:** TASK-9 (upload UI)

---

### TASK-9: Photo Upload UI

**Stories:** US-7, US-9

**Scope:**
- Drag-and-drop uploader
- Progress tracking
- Photo gallery

**UI Components:**
```
apps/dashboard/src/
├── routes/events/[id]/upload.tsx    # Upload page
├── routes/events/[id]/gallery.tsx   # Gallery page
├── components/photos/
│   ├── PhotoUploader.tsx            # Drag-drop zone
│   ├── UploadProgress.tsx           # Progress list
│   ├── PhotoGrid.tsx                # Gallery grid
│   └── PhotoCard.tsx                # Photo thumbnail
├── hooks/
│   └── usePhotoUpload.ts            # Upload logic
```

**New Dependencies:**
```bash
pnpm add react-dropzone
```

**Acceptance:**
- [ ] Drag-and-drop works
- [ ] File picker works
- [ ] Progress shows per file
- [ ] 4-6 concurrent uploads
- [ ] Gallery shows photos with status

**Dependencies:** TASK-8 (API)
**Can Run Parallel With:** TASK-8 (API development)

---

## Phase 5: Integration

### TASK-10: Face Detection DB Integration

**Stories:** US-8, US-9

**Scope:**
- Update queue consumer to write to DB
- Photo status updates
- Face records creation

**Files to Modify:**
```
apps/api/src/queue/photo-consumer.ts
```

**Key Logic:**
```typescript
// After successful indexFaces:
// 1. Insert face records with all attributes
// 2. Update photo: status='ready', face_count=N
// 3. Update event: photo_count++, face_count+=N

// On error:
// 1. Update photo: status='failed', processing_error=msg
```

**Acceptance:**
- [ ] Faces written to DB with attributes
- [ ] Photo status updates to 'ready'
- [ ] Event counts updated
- [ ] Gallery shows face count badges

**Dependencies:** TASK-8 (upload flow working)
**Can Run Parallel With:** None (final integration)

---

## Parallel Execution Strategy

### Wave 1 (Start Together)
```
TASK-1: Database Schema ─────────────┐
                                     ├── Wait for both
TASK-5: R2 CORS Configuration ───────┘
```

### Wave 2 (After Schema)
```
TASK-2: Auth Integration ────────────┐
                                     │
TASK-6: Stripe Backend ──────────────┼── Can run parallel
                                     │
TASK-7: Payment UI (partial) ────────┘
```

### Wave 3 (After Auth)
```
TASK-3: Dashboard API & UI ──────────┐
                                     ├── Can run parallel
TASK-4: Event Creation ──────────────┘
```

### Wave 4 (After Events + CORS)
```
TASK-8: Photo Upload API ────────────┐
                                     ├── Can run parallel
TASK-9: Photo Upload UI ─────────────┘
```

### Wave 5 (Final)
```
TASK-10: Face Detection Integration
```

---

## Time Estimates

| Task | Estimated Effort | Parallel Factor |
|------|------------------|-----------------|
| TASK-1 | 1 day | - |
| TASK-2 | 0.5 day | - |
| TASK-3 | 1 day | 2x |
| TASK-4 | 1 day | 2x |
| TASK-5 | 0.5 day | - |
| TASK-6 | 1 day | 2x |
| TASK-7 | 0.5 day | 2x |
| TASK-8 | 1.5 days | 2x |
| TASK-9 | 1.5 days | 2x |
| TASK-10 | 1 day | - |

**Serial:** ~9.5 days
**With Parallelization:** ~5-6 days

---

## Recommended Execution

**Solo Developer:**
1. TASK-1 + TASK-5 (foundation)
2. TASK-2 → TASK-3 → TASK-4 (core features)
3. TASK-6 → TASK-7 (payments)
4. TASK-8 → TASK-9 (uploads)
5. TASK-10 (integration)

**Two Developers:**
- Dev A: TASK-1, TASK-2, TASK-3, TASK-8, TASK-10
- Dev B: TASK-5, TASK-6, TASK-7, TASK-4, TASK-9

---

## Definition of Done

Each task is complete when:
1. Code implemented and type-safe
2. Unit tests pass (if applicable)
3. Manual testing confirms acceptance criteria
4. No TypeScript errors
5. Code reviewed (if team)
