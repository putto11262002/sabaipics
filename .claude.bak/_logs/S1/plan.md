# S-1 Implementation Plan: Photographer Onboarding & Upload

**Slice:** S-1
**Date:** 2026-01-06
**Status:** Ready for Implementation

---

## Overview

S-1 delivers the complete photographer onboarding and photo upload workflow:

> **Demo:** Photographer signs up, purchases credits, creates event, uploads photos with face detection, returns to dashboard on subsequent visits

---

## Dependencies & Prerequisites

### Already Established (Use As-Is)

| Component | Location | Status |
|-----------|----------|--------|
| Clerk Auth | `packages/auth` | Ready - middleware, React SDK, webhooks |
| Hono API Framework | `apps/api` | Ready - route patterns, typing |
| AWS Rekognition | `apps/api/src/lib/rekognition` | Ready - client, indexFaces, rate limiter |
| Queue Consumer | `apps/api/src/queue/photo-consumer.ts` | Ready - batch processing |
| R2 Storage | wrangler.jsonc | Ready - PHOTOS_BUCKET binding |
| shadcn/ui | `packages/ui` | Ready - Card, Alert, Button |

### Requires Implementation

1. **Database Schema** - All tables from data_schema.md
2. **Stripe Integration** - Payment flow (see research)
3. **QR Code Generation** - @juit/qrcode (see research)
4. **Photo Upload Pipeline** - Presigned URLs (see research)

---

## Implementation Layers

### Layer 1: Database Schema

**Scope:** Implement all tables needed for S-1

```
packages/db/src/schema/
├── photographers.ts   # FR-1, FR-2, FR-21
├── events.ts          # FR-6, FR-25
├── event-access.ts    # FR-25 (QR codes)
├── photos.ts          # FR-7
├── faces.ts           # FR-9
├── credit-ledger.ts   # FR-4, FR-5
├── payments.ts        # FR-4, FR-5
├── consent-records.ts # FR-21
└── index.ts           # Re-export all
```

**Migration Strategy:**
- Use Drizzle Kit for migrations
- Run `pnpm db:push` for schema sync
- Tables from docs/tech/01_data_schema.md

---

### Layer 2: API Endpoints

#### Auth & User Management

| Endpoint | Method | Purpose | Story |
|----------|--------|---------|-------|
| `/auth/me` | GET | Current user info | US-2 |
| `/webhooks/clerk` | POST | User lifecycle | US-1 |

*Already exists - needs DB integration*

#### Photographer Profile

| Endpoint | Method | Purpose | Story |
|----------|--------|---------|-------|
| `/photographers/me` | GET | Get current photographer | US-3 |
| `/photographers/me` | PATCH | Update profile | - |

#### Credits & Payments

| Endpoint | Method | Purpose | Story |
|----------|--------|---------|-------|
| `/credits/balance` | GET | Get credit balance | US-3 |
| `/credits/packages` | GET | List available packages | US-4 |
| `/credits/purchase` | POST | Create Stripe checkout | US-4 |
| `/webhooks/stripe` | POST | Payment completion | US-4 |

#### Events

| Endpoint | Method | Purpose | Story |
|----------|--------|---------|-------|
| `/events` | GET | List photographer's events | US-3 |
| `/events` | POST | Create new event | US-5 |
| `/events/:id` | GET | Get event details | US-5 |
| `/events/:id` | PATCH | Update event | - |
| `/events/:id/qr` | GET | Generate QR code PNG | US-6 |

#### Photo Upload

| Endpoint | Method | Purpose | Story |
|----------|--------|---------|-------|
| `/events/:id/photos/upload-session` | POST | Get presigned URLs | US-7 |
| `/events/:id/photos/confirm-uploads` | POST | Confirm & enqueue | US-7 |
| `/events/:id/photos` | GET | List photos with status | US-9 |
| `/photos/:id` | DELETE | Delete photo | - |

---

### Layer 3: Dashboard UI

#### Pages

| Route | Component | Purpose | Story |
|-------|-----------|---------|-------|
| `/sign-in` | SignInPage | Clerk sign-in | US-1 |
| `/sign-up` | SignUpPage | Clerk sign-up + PDPA | US-1 |
| `/dashboard` | DashboardPage | Main dashboard | US-3 |
| `/credits` | CreditsPage | Purchase credits | US-4 |
| `/events/new` | CreateEventPage | Create event | US-5 |
| `/events/:id` | EventDetailPage | Event details + QR | US-6 |
| `/events/:id/upload` | UploadPage | Photo upload | US-7 |
| `/events/:id/gallery` | GalleryPage | Photo gallery | US-9 |

#### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| CreditBalance | `components/credits/` | Display balance + expiry |
| EventCard | `components/events/` | Event preview card |
| PhotoUploader | `components/photos/` | Drag-drop upload UI |
| PhotoGrid | `components/photos/` | Gallery with face counts |
| QRCodeDisplay | `components/events/` | QR code viewer/download |
| ProcessingStatus | `components/photos/` | Face detection progress |

---

## Story-by-Story Implementation

### US-1: First-time photographer signs up with social login or email

**Backend:**
- [x] Clerk webhook handler exists
- [ ] Update to write to `photographers` table
- [ ] Add PDPA consent recording

**Frontend:**
- [x] Sign-up page exists
- [ ] Add PDPA consent checkbox before completion
- [ ] Configure Clerk to require consent

**Acceptance Criteria:**
- [ ] Can choose Google login, LINE login, or email signup
- [ ] Social login creates account automatically on return
- [ ] Email signup sends verification code, validates, creates account
- [ ] PDPA consent required before signup completes
- [ ] Failed social login shows fallback to email
- [ ] Invalid code shows error with resend option

---

### US-2: Session persists and auto-restores on return visits

**Backend:**
- Already handled by Clerk JWT with auto-refresh

**Frontend:**
- [x] ProtectedRoute component exists
- [ ] Add session expiry detection and redirect

**Acceptance Criteria:**
- [ ] Valid session redirects to dashboard immediately
- [ ] Expired session redirects to login with message
- [ ] Session auto-refreshes on activity
- [ ] Session persists across browser restarts
- [ ] Logout clears session and redirects to login

---

### US-3: Dashboard displays credit balance, events, and quick actions

**Backend:**
- [ ] `GET /photographers/me` - profile + credit balance
- [ ] `GET /events` - list events with photo counts

**Frontend:**
- [ ] DashboardPage with:
  - Credit balance widget (balance + expiry breakdown)
  - Event list (with photo counts, face counts)
  - "Create Event" CTA button
  - "Buy Credits" CTA button
  - Empty state for new photographers

**Acceptance Criteria:**
- [ ] Shows credit balance with expiry breakdown
- [ ] Shows event list with photo counts
- [ ] Create Event and Buy Credits buttons prominent
- [ ] Empty state for new photographers
- [ ] Loads within 2 seconds (p95)

---

### US-4: Select and complete credit package purchase

**Backend:**
- [ ] `GET /credits/packages` - list packages
- [ ] `POST /credits/purchase` - create Stripe checkout
- [ ] `POST /webhooks/stripe` - handle payment completion
- [ ] Credit ledger entry on success

**Frontend:**
- [ ] CreditsPage with package cards
- [ ] Redirect to Stripe Checkout
- [ ] Success callback with confirmation

**Acceptance Criteria:**
- [ ] View available credit packages with pricing
- [ ] Package selection opens payment flow
- [ ] Payment completion adds credits immediately
- [ ] Payment declined shows error with retry option
- [ ] Receipt/confirmation shown after success

---

### US-5: Create event with name and optional dates

**Backend:**
- [ ] `POST /events` - create event
- [ ] Generate unique event code
- [ ] Create Rekognition collection
- [ ] Create default event_access record

**Frontend:**
- [ ] CreateEventPage form (name, dates optional)
- [ ] Redirect to event detail on success

**Acceptance Criteria:**
- [ ] Enter event name (required)
- [ ] Optionally add event start date
- [ ] Event appears in dashboard immediately
- [ ] Unique event code generated
- [ ] QR code generated and downloadable
- [ ] Face detection index initialized

---

### US-6: QR code links to selfie search and is downloadable

**Backend:**
- [ ] `GET /events/:id/qr` - generate QR PNG
- [ ] Install @juit/qrcode

**Frontend:**
- [ ] QRCodeDisplay component
- [ ] Download button (PNG format)

**Acceptance Criteria:**
- [ ] QR code displayed on event card
- [ ] Downloadable in PNG format
- [ ] Scans successfully in mobile camera apps
- [ ] Opens selfie search page for correct event

---

### US-7: Background photo upload with immediate processing

**Backend:**
- [ ] `POST /events/:id/photos/upload-session` - presigned URLs
- [ ] `POST /events/:id/photos/confirm-uploads` - enqueue jobs
- [ ] Configure R2 CORS

**Frontend:**
- [ ] PhotoUploader component (react-dropzone)
- [ ] usePhotoUpload hook
- [ ] Progress indicators per file
- [ ] Parallel upload (4-6 concurrent)

**Acceptance Criteria:**
- [ ] Drag-and-drop and file picker supported
- [ ] Accepts JPEG, PNG, HEIC, WebP (max 5MB each)
- [ ] Upload starts immediately (no confirmation)
- [ ] Can add more files while uploading
- [ ] Per-file progress indicators
- [ ] Failed uploads retry automatically
- [ ] 100 photos upload in <5 minutes on 3Mbps

---

### US-8: Automatic face detection and indexing after upload

**Backend:**
- [x] Queue consumer exists
- [ ] Write face records to DB after indexing
- [ ] Update photo status and face_count

**Frontend:**
- [ ] ProcessingStatus component
- [ ] Real-time status updates (polling or WebSocket)

**Acceptance Criteria:**
- [ ] Starts automatically after upload completes
- [ ] Shows processing status (45/100 processed)
- [ ] Photos with no faces accepted but excluded from index
- [ ] Detection errors retry automatically
- [ ] Face count badge on each photo
- [ ] 95%+ accuracy on clear photos

---

### US-9: Event gallery displays photos with face counts

**Backend:**
- [ ] `GET /events/:id/photos` - paginated photo list

**Frontend:**
- [ ] PhotoGrid component
- [ ] Lazy loading thumbnails
- [ ] Face count badges
- [ ] Processing indicator overlay

**Acceptance Criteria:**
- [ ] Grid of photo thumbnails
- [ ] Face count badges after processing
- [ ] Processing indicator on pending photos
- [ ] Click thumbnail to view full-size
- [ ] Pagination or infinite scroll
- [ ] Updates as photos finish processing

---

## Technical Decisions

### From Research

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Stripe SDK | Direct fetch() API | No Node.js dependencies |
| QR Library | @juit/qrcode | Zero deps, Workers compatible |
| Upload Strategy | Presigned URLs to R2 | Parallel, no egress cost |
| Concurrent Uploads | 4-6 files | Balance speed & stability |

### Infrastructure

| Component | Configuration |
|-----------|--------------|
| R2 CORS | Allow PUT from app domains |
| Stripe Webhooks | checkout.session.completed |
| Queue Batch Size | 50 (existing) |
| Rate Limiter | 50 TPS Rekognition (existing) |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Face detection latency | High | Progress indicators, background processing |
| Upload performance | Medium | Presigned URLs, parallel uploads |
| Payment provider complexity | High | Error handling, reconciliation fallback |
| HEIC/WebP compatibility | Medium | Validation warnings, fallback handling |

---

## Dependencies Between Stories

```
US-1 (Sign-up) ──┬──> US-2 (Session)
                 │
                 └──> US-3 (Dashboard) ──┬──> US-4 (Credits)
                                         │
                                         └──> US-5 (Create Event) ──┬──> US-6 (QR)
                                                                    │
                                                                    └──> US-7 (Upload) ──> US-8 (Face Detection) ──> US-9 (Gallery)
```

---

## Implementation Order

### Phase 1: Foundation (Database + Auth Integration)
1. Database schema implementation
2. Clerk webhook → DB writes
3. Basic photographer profile endpoint

### Phase 2: Core Dashboard
4. Dashboard page with credits & events
5. Event creation flow
6. QR code generation

### Phase 3: Payment Flow
7. Credit packages listing
8. Stripe checkout integration
9. Webhook handling

### Phase 4: Photo Pipeline
10. Upload session + presigned URLs
11. R2 CORS configuration
12. Upload UI with progress
13. Confirm uploads + queue integration

### Phase 5: Face Detection Integration
14. Queue consumer → DB writes
15. Photo status updates
16. Gallery with face counts

---

## Success Metrics

- Photographer can complete onboarding in <2 minutes
- 100 photos upload in <5 minutes on 3Mbps
- Face detection completes within 5 minutes for 100 photos
- Dashboard loads in <2 seconds (p95)
- 95%+ face detection accuracy on clear photos
