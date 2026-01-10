# Risk Scout Report

Execution root: `BS_0001_S-1`
Slice: `d999677d-0b51-4b3b-b163-eec36a5bdde3`
Generated: `2026-01-09 16:30 ICT`

## High-impact risks (with mitigation ideas)

### Payment & Credits

- `[RISK]` **Payment provider IS specified but no credit purchase endpoint exists** - Stripe integration is implemented (`apps/api/src/lib/stripe/`) with checkout session, customer management, and webhook handling. However, there is no API route to actually initiate a credit purchase (no `/credits/purchase` or `/checkout` endpoint). The Stripe library is ready but the application layer to connect photographer dashboard to checkout is missing.
  - Mitigation: Implement `POST /credits/purchase` endpoint that creates a Stripe checkout session with the appropriate credit package metadata
  - Rollout: Deploy behind feature flag, test with Stripe test mode first
  - Rollback: Stripe checkout URLs are ephemeral; if issues arise, disable the purchase button in UI

- `[RISK]` **Credit ledger table not implemented in database** - Schema exists in docs (`docs/deprecated/tech/01_data_schema.md`) but `packages/db/src/schema/index.ts` only exports a test table. No `credit_ledger`, `photographers`, `events`, `photos`, or `faces` tables exist in the codebase.
  - Mitigation: Create Drizzle schema files for all core tables before implementing credit purchase flow
  - Rollout: Run migrations in staging first, verify schema with seed data
  - Rollback: Use Drizzle migration rollback

### Authentication & Session Management

- `[RISK]` **User type security vulnerability flagged but unresolved** - `apps/api/src/routes/webhooks/clerk.ts:100-102` explicitly marks a TODO: "SECURITY - user_type from unsafeMetadata is not secure. Anyone can set this during signup." This affects photographer vs participant distinction.
  - Mitigation: Either use separate Clerk apps per user type, or validate user type from signup URL origin, or require admin approval for photographer accounts
  - Monitoring: Add alerting for suspicious user_type changes
  - Rollback: Can retroactively audit and fix user types in database

- `[RISK]` **Session security vs UX tradeoff not decided** - Clerk authentication is wired up with networkless JWT verification (`packages/auth/src/middleware.ts`), but session timeout policy and refresh token handling strategy are not documented. Default Clerk behavior may not match Thai market expectations for session duration.
  - Mitigation: Document and configure Clerk session lifetime settings before launch
  - Monitoring: Track session expiry events, user re-auth friction

### Face Detection & Image Processing

- `[RISK]` **Face detection service IS specified (AWS Rekognition) but DB persistence not wired** - Queue consumer (`apps/api/src/queue/photo-consumer.ts:152-153`) has TODO: "Application layer will handle DB writes here" - the IndexFaces result is not saved to any `faces` table because the table does not exist yet.
  - Mitigation: Create faces schema and implement application layer handler in photo-consumer
  - Rollout: Deploy with observability to track indexing success rate
  - Rollback: Queue has DLQ configured, can replay failed messages after fix

- `[RISK]` **HEIC handling is documented but not implemented** - Docs mention HEIC/WebP support (`docs/deprecated/tech/05_image_pipeline.md:70`), but there is no image format validation or conversion code in the API. Rekognition may not support HEIC directly.
  - Mitigation: Research Rekognition HEIC support; if unsupported, add image conversion step (e.g., via Cloudflare Images or sharp)
  - Rollout: Test with real HEIC samples from modern iPhones before launch
  - Rollback: Reject HEIC uploads with user-friendly error if conversion fails

### Upload Performance

- `[RISK]` **Upload endpoint does not exist** - `POST /api/events/:id/photos` is documented (`docs/deprecated/tech/05_image_pipeline.md:37`) but not implemented. Current routes are only `/auth/*`, `/webhooks/*`, and `/db-test/*`. No events or photos routes exist.
  - Mitigation: Implement upload endpoint with proper validation, R2 streaming, and queue enqueue
  - Rollout: Load test with realistic photo sizes (5-50MB) before launch
  - Monitoring: Track upload duration, queue backlog size

- `[RISK]` **Slow connection handling not addressed** - No chunked upload, resumable upload, or progress tracking implemented. Large uploads over unstable connections (common in Thailand for remote event venues) may fail silently.
  - Mitigation: Consider TUS protocol for resumable uploads, or at minimum implement client-side retry with progress
  - Rollout: Soft launch with photographers who have good connectivity first

### Dashboard & Gallery

- `[RISK]` **Dashboard is a stub** - `apps/dashboard/src/routes/dashboard/index.tsx` only shows a "protected API test" card. No event management, photo gallery, or credit balance UI exists.
  - Mitigation: Prioritize event list, credit balance display, and upload UI before other dashboard features
  - Rollout: Iterative UI deployment, gated by feature flags

- `[RISK]` **QR code generation not implemented** - Event access table schema includes QR codes but no code generation library or API endpoint exists.
  - Mitigation: Add `qrcode` library, implement `POST /events/:id/access` endpoint to create QR access codes
  - Rollout: Test QR generation and scanning with multiple devices

## Decision points (must stop for HI)

- `[NEED_DECISION]` **Session timeout policy** - What session duration for photographers? Options:
  - A) 24 hours (convenience, higher risk)
  - B) 4 hours with refresh (balanced)
  - C) 1 hour strict (security-first, may frustrate photographers uploading at events)

- `[NEED_DECISION]` **HEIC/RAW file handling** - How to handle non-JPEG uploads from pro cameras? Options:
  - A) Convert HEIC/WebP on upload, reject RAW (simpler)
  - B) Accept all, convert in queue consumer before Rekognition (more complex)
  - C) Accept all, use Cloudflare Images for on-the-fly conversion (may have format limitations)

- `[NEED_DECISION]` **Credit package pricing** - Stripe checkout is ready but package definitions (price points, credit amounts) are not in code. Options:
  - A) Hardcode initial packages in API
  - B) Store packages in DB (admin configurable)
  - C) Use Stripe Products/Prices directly (most flexible, requires Stripe dashboard setup)

- `[NEED_DECISION]` **User type verification** - How to secure photographer vs participant distinction? Options:
  - A) Separate Clerk apps (cleanest, requires two auth integrations)
  - B) Admin approval queue for photographer accounts (adds friction)
  - C) Validate from signup URL/origin + immediate soft-lock if suspicious (quickest to implement)

## Gaps

- `[GAP]` **No database schema implemented** - Only test table exists. Need: photographers, participants, events, event_access, photos, faces, credit_ledger, payments, search_sessions, search_results, deliveries, line_notifications, consent_records

- `[GAP]` **No events routes** - Missing: `POST /events` (create), `GET /events` (list), `GET /events/:id` (detail), `PATCH /events/:id` (update), `POST /events/:id/photos` (upload)

- `[GAP]` **No search endpoint** - `POST /api/search` for face search not implemented. SearchFacesByImage integration missing.

- `[GAP]` **No LINE login** - Clerk is configured but LINE OAuth provider is only referenced in webhook handler. No LINE-specific auth flow documented or implemented.

- `[GAP]` **No PDPA consent collection** - consent_records table designed but no API to create/check consent. Required before face detection can legally run.

- `[GAP]` **No gallery display endpoint** - No way to retrieve photos for event gallery or search results.

- `[GAP]` **FTP server exists but no upload API to call** - `apps/ftp-server/internal/transfer/upload_transfer.go` expects `t.apiClient.UploadFormData()` but the target endpoint (`POST /events/:id/photos`) does not exist.

- `[NEED_VALIDATION]` **LINE webhook follow/unfollow updates line_linked** - Webhook handler exists (`apps/api/src/routes/webhooks/line.ts`) but implementation not verified. Need to confirm it correctly updates participant.line_linked for push message eligibility.

- `[NEED_VALIDATION]` **Cloudflare Images integration** - Docs mention using CF Images for thumbnails but no implementation found. Need to verify R2 + CF Images configuration.

- `[NEED_VALIDATION]` **Rekognition 50 TPS limit handling** - Rate limiter Durable Object exists (`apps/api/src/durable-objects/rate-limiter.ts`) but need to validate it works correctly under load with queue consumer.

## Provenance (commands run)

- `Glob` - Found all source files in `apps/api/src/**/*.ts`, `apps/dashboard/src/**/*.{ts,tsx}`, `packages/**/*.ts`, `docs/**/*.md`
- `Read` - Examined:
  - `apps/api/src/index.ts` (main Hono app, routes)
  - `apps/api/src/routes/auth.ts` (auth endpoints)
  - `apps/api/src/routes/webhooks/clerk.ts` (user creation, security TODO)
  - `apps/api/src/lib/stripe/index.ts`, `checkout.ts` (Stripe implementation)
  - `apps/api/src/lib/rekognition/client.ts` (face detection client)
  - `apps/api/src/queue/photo-consumer.ts` (queue handler with DB TODO)
  - `apps/api/src/types/photo-job.ts` (queue message shape)
  - `apps/api/wrangler.jsonc` (infrastructure config)
  - `apps/dashboard/src/App.tsx`, routes (UI state)
  - `packages/auth/src/middleware.ts`, `types.ts` (auth implementation)
  - `packages/db/src/schema/index.ts` (only test table)
  - `docs/deprecated/tech/01_data_schema.md` (full schema design)
  - `docs/deprecated/tech/05_image_pipeline.md` (upload flow design)
  - `docs/tech/ARCHITECTURE.md`, `TECH_STACK.md` (system overview)
- `Grep` - Searched for HEIC/WebP handling, route patterns, endpoint definitions
