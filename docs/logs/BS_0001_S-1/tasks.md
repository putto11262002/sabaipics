# Engineering Tasks

Execution root: `BS_0001_S-1`
Upstream (PM): slice `d999677d-0b51-4b3b-b163-eec36a5bdde3` (S-1: Photographer Onboarding & Photo Upload)
Plan: `docs/logs/BS_0001_S-1/plan/final.md`

---

## Dependency Graph

```
Phase 0 (Foundation)
  T-1 (DB Schema)
    ├─► T-2 (Auth Middleware)
    ├─► T-3 (Admin Credit Packages API)
    │
Phase 1 (Auth)
    ├─► T-4 (Clerk Webhook)
    ├─► T-5 (Consent API) ──► T-6 (Signup UI)
    │
Phase 2 (Dashboard)
    ├─► T-7 (Dashboard API)
    ├─► T-8 (Credit Packages API)
    ├─► T-9 (Stripe Checkout API) ──► T-10 (Stripe Webhook)
    │     └──────────────────────────► T-11 (Dashboard UI)
    │                                  T-12 (Credit Packages UI)
    │
Phase 3 (Events)
    ├─► T-13 (Events API) + T-14 (QR Lib) ──► T-15 (Events UI)
    │
Phase 4 (Upload)
    └─► T-16 (Upload API) ──► T-17 (Queue Consumer)
        T-18 (Gallery API) ──► T-19 (Upload + Gallery UI)

Cleanup
    T-20 (Rekognition Cleanup Cron)
```

---

## Tasks

### T-1 — Create database schema (all domain tables)
- [x] Done
- **Type:** `scaffold`
- **StoryRefs:** All (foundation)
- **Refs:** `docs/logs/BS_0001_S-1/plan/final.md#database-schema`
- **Goal:** Create Drizzle schema and migrations for all domain tables: photographers, credit_packages, credit_ledger, events, photos, faces, consent_records.
- **PrimarySurface:** `DB`
- **Scope:** `packages/db/src/schema/`, `packages/db/drizzle/`
- **Dependencies:** None
- **Acceptance:**
  - All 7 tables created with correct columns and types
  - `faces.rekognition_response` is JSONB
  - `credit_ledger.expires_at` indexed for balance queries
  - Foreign keys and cascades configured
  - Migrations run successfully on local and staging
- **Tests:**
  - Migration up/down works
  - Schema matches plan spec
- **Rollout/Risk:**
  - Low risk (greenfield, no existing data)
  - Run migrations in staging first

---

### T-2 — Implement requirePhotographer middleware
- [x] Done
- **Type:** `scaffold`
- **StoryRefs:** All (foundation)
- **Goal:** Create middleware that verifies Clerk auth AND checks photographer exists in DB. Attach photographer to request context.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/middleware/`, `packages/auth/`
- **Dependencies:** `T-1`
- **Acceptance:**
  - Middleware rejects requests without valid Clerk session
  - Middleware rejects requests where photographer not found in DB
  - Photographer object available in request context
  - Returns 401/403 with appropriate error messages
- **Tests:**
  - Unit tests for auth flow
  - Integration test with mock Clerk token
- **Rollout/Risk:**
  - Low risk
  - Existing `requireAuth()` can be extended

---

### T-3 — Admin credit packages API
- [x] Done
- **Type:** `scaffold`
- **StoryRefs:** US-4 (foundation for credit purchase)
- **Goal:** Create admin endpoints to manage credit packages: GET/POST/PATCH /admin/credit-packages.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/admin/`
- **Dependencies:** `T-1`
- **Acceptance:**
  - `GET /admin/credit-packages` returns all packages
  - `POST /admin/credit-packages` creates new package
  - `PATCH /admin/credit-packages/:id` updates package (price, credits, active status)
  - Admin auth required (can be simple API key for MVP)
- **Tests:**
  - Unit tests for CRUD operations
  - Validation tests (required fields, positive amounts)
- **Rollout/Risk:**
  - Low risk
  - Seed initial packages after deploy

---

### T-4 — Clerk webhook handler for user.created
- [x] Done
- **Type:** `feature`
- **StoryRefs:** US-1
- **Goal:** Handle Clerk `user.created` webhook to create photographer record in DB with email from Clerk user object.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/webhooks/clerk.ts`
- **Dependencies:** `T-1`
- **Acceptance:**
  - Webhook creates `photographers` row with clerk_id, email, name
  - Handles duplicate webhooks (idempotent on clerk_id)
  - Returns 200 to Clerk on success
  - Logs errors but returns 200 (prevent Svix retries on bad data)
- **Tests:**
  - Unit test with mock webhook payload
  - Test idempotency (same event twice)
- **Rollout/Risk:**
  - Medium risk (auth flow)
  - Test with Clerk webhook simulator first

---

### T-5 — PDPA consent API
- [x] Done
- **Type:** `feature`
- **StoryRefs:** US-1
- **Goal:** Create `POST /consent` endpoint to record PDPA consent and update photographer record.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/consent.ts`
- **Dependencies:** `T-1`, `T-2`
- **PR:** https://github.com/putto11262002/sabaipics/pull/11
- **Acceptance:**
  - `POST /consent` creates consent_record row
  - Updates `photographers.pdpa_consent_at`
  - Requires authenticated photographer
  - Returns error if already consented (idempotent)
- **Tests:**
  - Unit test consent creation
  - Test duplicate consent handling
- **Rollout/Risk:**
  - Low risk
  - PDPA copy needs PM review before launch

---

### T-6 — Signup UI + PDPA consent modal
- [x] Done
- **Type:** `feature`
- **StoryRefs:** US-1, US-2
- **Goal:** Create photographer signup page with Clerk components and PDPA consent modal that blocks dashboard access until accepted.
- **PrimarySurface:** `UI`
- **Scope:** `apps/dashboard/src/routes/auth/`, `apps/dashboard/src/components/`
- **Dependencies:** `T-4`, `T-5`
- **PR:** https://github.com/putto11262002/sabaipics/pull/14
- **Acceptance:**
  - `/photographer/signup` shows Clerk SignUp component
  - After signup, PDPA modal appears (blocking)
  - Accept calls `POST /consent`, then redirects to dashboard
  - Decline shows explanation with retry option
  - Session persists across browser restarts (24h)
- **Tests:**
  - E2E test signup flow (mock Clerk)
  - Test PDPA modal blocking behavior
- **Rollout/Risk:**
  - Medium risk (auth UX)
  - Test on mobile browsers (Thai users)

---

### T-7 — Dashboard API
- [x] Done
- **Type:** `feature`
- **StoryRefs:** US-3
- **Goal:** Create `GET /dashboard` endpoint returning credit balance, events list, and stats.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/dashboard.ts`
- **Dependencies:** `T-1`, `T-2`
- **PR:** https://github.com/putto11262002/sabaipics/pull/12
- **Acceptance:**
  - Returns `{ credits: { balance, nearestExpiry }, events: [...], stats: {...} }`
  - Balance uses FIFO unexpired sum query
  - Events sorted by createdAt desc
  - Stats include totalPhotos, totalFaces
- **Tests:**
  - Unit test balance calculation with expiry
  - Test empty state (new user)
- **Rollout/Risk:**
  - Low risk

---

### T-8 — Credit packages public API
- [x] Done
- **Type:** `feature`
- **StoryRefs:** US-4
- **Goal:** Create `GET /credit-packages` endpoint returning active packages for purchase.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/credits.ts`
- **Dependencies:** `T-1`, `T-2`
- **PR:** https://github.com/putto11262002/sabaipics/pull/13
- **Acceptance:**
  - Returns only active packages
  - Sorted by sort_order
  - Includes id, name, credits, priceTHB
- **Tests:**
  - Unit test filtering active only
- **Rollout/Risk:**
  - Low risk

---

### T-9 — Stripe checkout API
- [x] Done
- **Type:** `feature`
- **StoryRefs:** US-4
- **Refs:** `docs/logs/BS_0001_S-1/research/stripe-credit-flow.md`
- **Goal:** Create `POST /credits/checkout` endpoint that creates Stripe Checkout session for selected package.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/credits.ts`, `apps/api/src/lib/stripe/`
- **Dependencies:** `T-1`, `T-2`, `T-8`
- **PR:** https://github.com/putto11262002/sabaipics/pull/15
- **Acceptance:**
  - Validates package exists and is active
  - Creates Stripe Checkout session with package metadata
  - Uses THB currency
  - Enables PromptPay payment method
  - Returns checkout URL
  - Includes success/cancel redirect URLs
- **Tests:**
  - Unit test with Stripe mock
  - Test invalid package ID
- **Rollout/Risk:**
  - High risk (payments)
  - Use Stripe test mode initially
  - Verify PromptPay works in Thailand

---

### T-10 — Stripe webhook handler
- [ ] Done
- **PR:** https://github.com/putto11262002/sabaipics/pull/17
- **Type:** `integration`
- **StoryRefs:** US-4
- **Refs:** `docs/logs/BS_0001_S-1/research/stripe-credit-flow.md`
- **Goal:** Handle `checkout.session.completed` webhook to add credits to photographer's ledger with FIFO expiry.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/webhooks/stripe.ts`, `apps/api/src/lib/stripe/handlers/`
- **Dependencies:** `T-1`, `T-9`
- **Acceptance:**
  - Verifies Stripe signature
  - Extracts package info from session metadata
  - Inserts credit_ledger row with `+amount`, `expires_at = NOW + 6 months`
  - Uses `stripe_session_id` as idempotency key (no duplicate credits)
  - Returns 200 on success
- **Tests:**
  - Unit test with mock webhook
  - Test idempotency (same session twice)
  - Test with missing metadata
- **Rollout/Risk:**
  - High risk (payments)
  - Monitor for webhook failures
  - Manual reconciliation process if needed

---

### T-11 — Dashboard UI
- [ ] Done
- **PR:** https://github.com/putto11262002/sabaipics/pull/19
- **Type:** `feature`
- **StoryRefs:** US-3
- **Goal:** Create dashboard page showing credit balance, event list, and action buttons.
- **PrimarySurface:** `UI`
- **Scope:** `apps/dashboard/src/routes/dashboard/`
- **Dependencies:** `T-7`
- **Acceptance:**
  - Shows credit balance with expiry warning
  - Lists events with photo counts
  - "Buy Credits" button links to `/credits/packages`
  - "Create Event" button opens modal
  - Empty state for new users
  - <2s p95 load time
- **Tests:**
  - Component tests for dashboard cards
  - Test empty state rendering
- **Rollout/Risk:**
  - Low risk

---

### T-12 — Credit packages page UI
- [x] Done
- **Type:** `feature`
- **StoryRefs:** US-4
- **Goal:** Create dedicated `/credits/packages` page for browsing and purchasing credit packages.
- **PrimarySurface:** `UI`
- **Scope:** `apps/dashboard/src/routes/credits/`
- **Dependencies:** `T-8`, `T-9`
- **PR:** https://github.com/putto11262002/sabaipics/pull/21
- **Acceptance:**
  - Displays all active packages with price and credit amount
  - Select package → calls checkout API → redirects to Stripe
  - Success page after return from Stripe
  - Error handling for failed payments
- **Tests:**
  - Component tests for package cards
  - E2E test purchase flow (Stripe test mode)
- **Rollout/Risk:**
  - Medium risk (payment UX)
  - Test on mobile

---

### T-13 — Events API (CRUD + QR generation)
- [ ] Done
- **PR:** https://github.com/putto11262002/sabaipics/pull/22
- **Type:** `feature`
- **StoryRefs:** US-5, US-6
- **Refs:** `docs/logs/BS_0001_S-1/research/qr-code-library.md`
- **Goal:** Create events API: POST /events, GET /events, GET /events/:id. Generate QR code on create and upload to R2.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/events.ts`, `apps/api/src/lib/qr/`
- **Dependencies:** `T-1`, `T-2`, `T-14`
- **Acceptance:**
  - `POST /events` creates event with unique access_code
  - Generates QR PNG with two URLs (search + slideshow)
  - Uploads QR to R2
  - Sets `expires_at = created_at + 30 days`
  - `rekognition_collection_id` starts as NULL
  - `GET /events` returns photographer's events
  - `GET /events/:id` returns single event with QR URL
- **Tests:**
  - Unit test event creation
  - Test access_code uniqueness
  - Test QR generation
- **Rollout/Risk:**
  - Medium risk (QR must work on mobile cameras)
  - Test QR scanning on multiple devices

---

### T-14 — QR code generation library
- [x] Done
- **Type:** `scaffold`
- **StoryRefs:** US-5, US-6
- **Refs:** `docs/logs/BS_0001_S-1/research/qr-code-library.md`
- **Goal:** Add `@juit/qrcode` and create wrapper function for generating QR PNGs with two URLs.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/lib/qr/`
- **Dependencies:** None
- **PR:** https://github.com/putto11262002/sabaipics/pull/18
- **Acceptance:**
  - `generateEventQR(accessCode)` returns PNG Uint8Array
  - QR contains both search and slideshow URLs
  - Works in Cloudflare Workers environment
- **Tests:**
  - Unit test QR generation
  - Verify generated QR is scannable
- **Rollout/Risk:**
  - Low risk

---

### T-15 — Events UI (list + create modal + QR display)
- [ ] Done
- **Type:** `feature`
- **StoryRefs:** US-5, US-6
- **Goal:** Create events list on dashboard, event creation modal, and QR code display/download.
- **PrimarySurface:** `UI`
- **Scope:** `apps/dashboard/src/routes/events/`, `apps/dashboard/src/components/`
- **Dependencies:** `T-13`
- **Acceptance:**
  - Event list shows name, dates, photo count, QR thumbnail
  - Create modal with name (required), start/end dates (optional)
  - Event detail shows large QR with both URLs
  - "Download QR" button downloads PNG
  - Links open in new tab
- **Tests:**
  - Component tests for event card
  - Test create modal validation
- **Rollout/Risk:**
  - Low risk

---

### T-16 — Photo upload API (validation + normalization + credit deduction)
- [ ] Done
- **Type:** `feature`
- **StoryRefs:** US-7
- **Refs:** `docs/logs/BS_0001_S-1/research/cf-upload-limits.md`
- **Goal:** Create `POST /events/:id/photos` endpoint that validates, deducts credit (FIFO), normalizes image, uploads to R2, and enqueues for processing.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/photos.ts`, `apps/api/src/lib/images/`
- **Dependencies:** `T-1`, `T-2`, `T-13`
- **Acceptance:**
  - Validates format (JPEG, PNG, HEIC, WebP only)
  - Validates size (≤ 20MB)
  - Validates credit balance ≥ 1
  - Deducts 1 credit with FIFO expiry inheritance
  - Normalizes to JPEG (4000px max, quality 90%) via CF Images
  - Uploads normalized JPEG to R2
  - Inserts photos row with status=processing
  - Enqueues job for face detection
  - Returns { photoId, status }
- **Tests:**
  - Unit test validation (format, size)
  - Test credit deduction with expiry
  - Test normalization (mock CF Images)
  - Integration test full flow
- **Rollout/Risk:**
  - High risk (core feature, payments involved)
  - Monitor upload success rate
  - Test with real HEIC files from iPhone

---

### T-17 — Photo queue consumer (Rekognition indexing)
- [ ] Done
- **Type:** `feature`
- **StoryRefs:** US-8
- **Refs:** `docs/logs/BS_0001_S-1/research/heic-rekognition.md`
- **Goal:** Update queue consumer to create Rekognition collection on first photo, call IndexFaces, and store full response.
- **PrimarySurface:** `Jobs`
- **Scope:** `apps/api/src/queue/photo-consumer.ts`
- **Dependencies:** `T-1`, `T-16`
- **Acceptance:**
  - If `events.rekognition_collection_id` is NULL, create collection and save ID
  - Fetch normalized JPEG from R2
  - Call Rekognition IndexFaces
  - Insert faces rows with full `rekognition_response` JSONB
  - Update photos row: status=indexed, face_count=N
  - Handle no-faces case (face_count=0, still indexed)
  - Retry with backoff on Rekognition errors
  - DLQ after 3 failures
- **Tests:**
  - Unit test with mock Rekognition
  - Test collection creation on first photo
  - Test no-faces handling
  - Test retry logic
- **Rollout/Risk:**
  - High risk (external service, cost)
  - Monitor Rekognition API errors
  - Monitor rate limiter DO

---

### T-18 — Gallery API
- [ ] Done
- **Type:** `feature`
- **StoryRefs:** US-9
- **Goal:** Create `GET /events/:id/photos` endpoint returning paginated photos with CF Images thumbnail URLs.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/photos.ts`
- **Dependencies:** `T-1`, `T-2`
- **Acceptance:**
  - Returns paginated photos (cursor-based, limit 50)
  - Each photo has: id, thumbnailUrl (400px), previewUrl (1200px), faceCount, status
  - Thumbnail/preview URLs use CF Images transform
  - Download URL is presigned R2 URL
  - Sorted by uploaded_at desc
- **Tests:**
  - Unit test pagination
  - Test URL generation
- **Rollout/Risk:**
  - Low risk

---

### T-19 — Upload dropzone + Gallery UI
- [ ] Done
- **Type:** `feature`
- **StoryRefs:** US-7, US-9
- **Goal:** Create upload dropzone with progress tracking and photo gallery grid with lightbox.
- **PrimarySurface:** `UI`
- **Scope:** `apps/dashboard/src/routes/events/[id]/`, `apps/dashboard/src/components/`
- **Dependencies:** `T-16`, `T-18`
- **Acceptance:**
  - Drag-and-drop + file picker
  - Client-side validation (format, size) with clear errors
  - Per-file upload progress
  - Processing status badges
  - Gallery grid with thumbnails (lazy loading)
  - Click photo → lightbox with 1200px preview
  - Download button in lightbox
  - Face count badges on thumbnails
- **Tests:**
  - Component tests for dropzone
  - Component tests for gallery grid
  - Test validation error messages
- **Rollout/Risk:**
  - Medium risk (UX critical)
  - Test on slow connections
  - Test on mobile

---

### T-20 — Rekognition cleanup cron job
- [ ] Done
- **Type:** `hardening`
- **StoryRefs:** None (ops)
- **Goal:** Create cron job to delete Rekognition collections for events older than 30 days.
- **PrimarySurface:** `Jobs`
- **Scope:** `apps/api/src/cron/`, `apps/api/wrangler.jsonc`
- **Dependencies:** `T-1`, `T-17`
- **Acceptance:**
  - Runs daily via Cloudflare Cron Trigger
  - Finds events where `created_at < NOW - 30 days` AND `rekognition_collection_id IS NOT NULL`
  - Calls Rekognition DeleteCollection for each
  - Updates event: `rekognition_collection_id = NULL`
  - Logs deletions for audit
  - Handles partial failures gracefully
- **Tests:**
  - Unit test with mock Rekognition
  - Test idempotency (already deleted)
- **Rollout/Risk:**
  - Medium risk (data deletion)
  - Run manually first, verify correct events selected
  - Keep audit logs

---

## Summary

| Phase | Tasks | PRs |
|-------|-------|-----|
| Phase 0 (Foundation) | T-1, T-2, T-3, T-14 | 4 |
| Phase 1 (Auth) | T-4, T-5, T-6 | 3 |
| Phase 2 (Dashboard) | T-7, T-8, T-9, T-10, T-11, T-12 | 6 |
| Phase 3 (Events) | T-13, T-15 | 2 |
| Phase 4 (Upload) | T-16, T-17, T-18, T-19 | 4 |
| Cleanup | T-20 | 1 |
| **Total** | **20 tasks** | **20 PRs** |

---

## Parallelization Opportunities

After T-1 (DB schema) completes, these can run in parallel:
- T-2, T-3, T-4, T-7, T-8, T-14, T-18

After Phase 0 + Phase 1, UI tasks can parallelize:
- T-6, T-11, T-12, T-15 can be worked on simultaneously by different engineers
