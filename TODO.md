# TODO

## Upload Pipeline Bugs (from exhaustive path review)

### Critical

- [x] **BUG-1/2/3/4: Enqueue failure after committed transaction causes double credit deduction + duplicate photos** — Fixed: Step 12 `PHOTO_QUEUE.send()` is now best-effort with Sentry capture. On failure, the message is still ACK'd (transaction already committed). Photo stays in `uploading` — reconciliation cron (STUCK-1) will re-enqueue.

### Stuck States

- [x] **STUCK-2/3: Pending intents stuck forever** — Fixed: new cron `expireStalePendingIntents` transitions `pending` intents to `expired` after 7 days. Existing Cron 2 then hard-deletes after 3 more days.
- [x] **STUCK-1: Photos stuck in `uploading` forever** — Fixed: photo consumer now checks `isLastAttempt` on all three retryable paths (throttle, retryable error, persist failure) and sets `status='failed', retryable=false` + ack on last attempt.

### Leaks (lower priority)

- [x] **LEAK-1: Orphan R2 objects (no matching intent)** — Fixed: R2 lifecycle rule via Terraform auto-deletes `uploads/` objects after 30 days.
- [x] **LEAK-2/3: Orphaned normalized R2 objects from failed retries** — Fixed: cleanup crons now infer the normalized key (`{eventId}/{photoId}.jpg`) from the intent and delete it alongside the original. No schema change needed.

## Upload Pipeline Review Findings (PRs #241–#244)

### Critical

- [ ] **C1: Idempotency guard missing `expired` status** — Guard checks `completed`/`failed` but not `expired`. If `max_retries: 1` redelivers after the expire-pending cron transitions the intent to `expired`, the consumer processes an already-expired intent (deducts credit, creates photo that cleanup cron later deletes). Fix: add `expired` to the guard.
- [ ] **C2: Reprocess orphans normalized JPEGs** — When `insufficient_credits` fails, step 8b writes `photoId` and step 9 writes `{eventId}/{photoId}.jpg` to R2. On reprocess, a new `photoId` is generated — the old normalized JPEG is orphaned with no reference. No cron or lifecycle rule covers these. Fix: in `reprocess.ts`, delete old normalized JPEG and clear `photoId` before resetting to `pending`.

### Medium

- [ ] **M1: Double Sentry capture for normalization errors** — `captureUploadError('normalization')` fires both inside `processUpload` (rich context) and in the error handler switch (minimal context). Inflates Sentry error counts. Fix: remove the capture in the error handler since `processUpload` already captured with better context.
- [ ] **M2: `database`/`r2` error handler lacks status guard** — The intent update in the `database`/`r2` error case has no `WHERE status = 'pending'` guard. Not currently exploitable but good defensive measure.

---

## Branding & Assets Audit

- [ ] **Regenerate brand assets** — Favicons, apple-touch-icons, and logos across all apps need updating for the new golden/orange brand color. Current state:
  - Dashboard: black stroke SVG favicon (no brand color)
  - Event app: white circle bg + dark mark (no brand color)
  - www: same as event (also uses purple accent, not golden/orange)
  - Desktop uploader: still uses generic Vite favicon
  - iOS: has purple `#9B8FC7` variant (stale)
  - Missing everywhere: `theme-color` meta tags, `manifest.json` / `site.webmanifest`, apple-touch-icons (event/www)
- [ ] **Design decision**: should all apps share one brand color, or should www keep a distinct marketing theme?

## Admin Dashboard — Cloudflare Access Setup

Pre-requisites before enabling CF Access (must be done manually in CF dashboard):

1. [x] **Scaffold admin app** — `src/admin/` + `wrangler.admin.jsonc` created (dev + prod only, no staging)
2. [ ] **Deploy admin Worker** — `pnpm deploy:admin:prod` to make `admin.framefast.io` live
3. [ ] **Enable Zero Trust** — CF Dashboard → Zero Trust (left sidebar). Pick free plan if first time (up to 50 users)
4. [ ] **Create Access Application** — Zero Trust → Access → Applications → Add application
   - Type: Self-hosted
   - Name: `FrameFast Admin`
   - Session duration: 24h (default is fine)
   - Domain: `admin.framefast.io`
5. [ ] **Add Access Policy** — inside the application:
   - Policy name: `Admin team`
   - Action: Allow
   - Include rule: Emails → add admin team emails
6. [ ] **Note the Team domain** — Zero Trust → Settings → Custom Pages → Team domain (e.g., `yourteam.cloudflareaccess.com`) — needed for JWT verification in API middleware

---

## www Styling Migration

- [ ] **Migrate www to centralized shadcn + shared styles** — www (Next.js marketing site) has its own independent shadcn components (14 of them, ~3.6k LOC) duplicating shared. Same build stack (Tailwind 4, PostCSS 4, OKLCH tokens) makes migration plausible.
  - Set up monorepo import infra (`@shared/` tsconfig paths in www)
  - Gradual component migration (Button, Badge, Card, etc.)
  - Decide on color theme approach: single theme vs `themes/www.css` override
  - Add missing semantic tokens (success/warning/info) to www
  - Reconcile radius scale (www: 1rem vs shared: 0.625rem)
  - Visual regression testing on all landing pages
  - Estimated effort: medium (1-2 weeks, incremental)
