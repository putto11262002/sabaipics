# Surface Map Report

Execution root: `BS_0001_S-1`
Slice: `d999677d-0b51-4b3b-b163-eec36a5bdde3`
Generated: `2026-01-09 16:15 ICT`

## Expected touch points (best-effort)

### API: `apps/api/src/`
- `routes/auth.ts` — Extend for social login (Google/LINE/email), profile endpoints; currently minimal `/me` and `/profile`
- `routes/` (new files) — Add `events.ts`, `photos.ts`, `credits.ts` routers for event creation, photo upload, credit purchase
- `handlers/stripe.ts` — Credit fulfillment logic already scaffolded with TODOs; needs DB writes for checkout.completed
- `lib/stripe/` — Existing checkout/customer infrastructure ready; wire to credits system
- `lib/line/` — LINE webhook exists; extend for social login callback handling
- `lib/rekognition/` — Face detection infrastructure exists; needs application layer for DB persistence
- `queue/photo-consumer.ts` — Photo processing queue ready; needs DB writes for face records (marked TODO line 152)
- `index.ts` — Register new routers (events, photos, credits); high-frequency edit point

### DB: `packages/db/`
- `src/schema/` — Currently only `test.ts` placeholder; **NEW tables required**: `photographers`, `events`, `photos`, `faces`, `credit_ledger`, `payments`
- `drizzle/` — New migrations for all domain tables

### UI: `apps/dashboard/src/`
- `routes/dashboard/index.tsx` — Currently test page; replace with photographer dashboard showing events, credits, stats
- `routes/` (new files) — Add `events/`, `photos/`, `credits/`, `settings/` route directories
- `routes/sign-in.tsx`, `routes/sign-up.tsx` — Social login UI (Google/LINE buttons via Clerk config)
- `components/` — Event creation forms, photo upload dropzone, QR code display, gallery grid
- `App.tsx` — Add new protected routes; currently has `/dashboard` only

### Packages: `packages/`
- `auth/src/middleware.ts` — `requirePhotographer()` stub exists (line 73-79); needs DB lookup implementation
- `auth/src/hooks.ts` — May need photographer-specific hooks
- `ui/src/components/` — Add form components, upload components, gallery grid via shadcn CLI

### Jobs/Ops: `apps/api/src/`
- `queue/photo-consumer.ts` — Already handles R2 fetch + Rekognition; needs face→DB persistence layer
- `durable-objects/rate-limiter.ts` — Existing rate limiter for Rekognition TPS
- `events/event-bus.ts` — Existing event bus pattern; extend for photo processing events

### FTP Server: `apps/ftp-server/`
- `internal/transfer/upload_transfer.go` — May need photo metadata integration with main API

## Hotspots / merge-risk

- `apps/api/src/index.ts` — **HIGH RISK**: Central router registration; every new feature adds a route here. 5 changes in recent history. **Mitigation**: Isolate route scaffolding in single PR; use consistent chained `.route()` pattern.

- `packages/db/src/schema/index.ts` — **HIGH RISK**: Currently just re-exports `test.ts`; will grow significantly with domain tables. **Mitigation**: Create one schema file per domain (`photographers.ts`, `events.ts`, `photos.ts`, etc.) and add exports incrementally; avoid monolithic schema file.

- `apps/dashboard/src/App.tsx` — **MEDIUM RISK**: Route registration point; each new feature adds routes. **Mitigation**: Group related routes under layout components.

- `packages/auth/src/middleware.ts` — **MEDIUM RISK**: `requirePhotographer()` stub will be filled in; auth layer touches all protected routes. **Mitigation**: Implement photographer lookup early as foundation PR.

- `apps/api/src/handlers/stripe.ts` — **LOW-MEDIUM RISK**: Contains TODO blocks for credit fulfillment; needs DB integration. **Mitigation**: Define credit_ledger schema first, then wire handlers.

## Dependency notes

### Depends on
- **Clerk** — Auth provider (already integrated); social login configured via Clerk dashboard
- **Stripe** — Payment processing (infrastructure ready in `lib/stripe/`); needs credit fulfillment logic
- **AWS Rekognition** — Face detection (infrastructure ready in `lib/rekognition/`, queue consumer exists)
- **Neon Postgres** — DB via `packages/db` with Drizzle ORM (client exists, schema placeholder only)
- **Cloudflare R2** — Photo storage (bucket binding exists in `wrangler.jsonc`)
- **Cloudflare Queues** — Photo processing queue (configured, consumer implemented)

### Potential new primitives
- **QR Code generation** — For event access links; no current implementation. Evidence: FR-25 requirement for QR codes.
- **Image optimization/resizing** — For gallery thumbnails; no current implementation. May use Cloudflare Images or R2 transform.
- **Background face grouping** — Post-indexing job to cluster faces by similarity; not yet scaffolded.
- **PDPA consent management** — Thai data privacy compliance; no current implementation per FR-21.

## Provenance (commands run)
- `ls -la` root directory
- `Glob apps/**/*` and `packages/**/*`
- `Read` on schema files: `packages/db/src/schema/index.ts`, `packages/db/src/schema/test.ts`
- `Read` on API files: `apps/api/src/index.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/routes/webhooks/index.ts`
- `Read` on queue/lib: `apps/api/src/queue/photo-consumer.ts`, `apps/api/src/lib/rekognition/index.ts`, `apps/api/src/lib/stripe/index.ts`, `apps/api/src/handlers/stripe.ts`
- `Read` on auth: `packages/auth/src/middleware.ts`, `packages/auth/src/index.ts`, `packages/auth/src/react.ts`
- `Read` on dashboard: `apps/dashboard/src/App.tsx`, `apps/dashboard/src/routes/dashboard/index.tsx`, `apps/dashboard/src/routes/sign-in.tsx`
- `Read` on config: `apps/api/wrangler.jsonc`
- `git log --oneline -20` for recent commits
- `git log` on `packages/db/src/schema/`, `apps/api/src/routes/`, `apps/api/src/index.ts` for change frequency
