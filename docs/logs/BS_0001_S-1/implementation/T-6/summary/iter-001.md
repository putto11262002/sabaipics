# Implementation Summary (iter-001)

Task: `T-6 — Signup UI + PDPA consent modal`
Root: `BS_0001_S-1`
Branch: `task/T-6-signup-pdpa-consent`
PR: https://github.com/putto11262002/sabaipics/pull/14
Date: `2026-01-10`

## Outcome
- Implemented photographer signup flow with PDPA consent modal
- Added dedicated `/onboarding` route that handles webhook race condition via polling
- Consent modal blocks dashboard access until accepted
- Decline flow offers retry and sign-out options
- Protected routes now require both auth AND consent via `ConsentGate` wrapper

## Key code changes

### New files
- `apps/dashboard/src/routes/onboarding.tsx` — Onboarding page with polling for webhook, consent modal, and decline states
- `apps/dashboard/src/components/consent/PDPAConsentModal.tsx` — Forced modal with PDPA text, checkbox, accept/decline buttons
- `apps/dashboard/src/components/auth/ConsentGate.tsx` — Route protection wrapper that redirects to /onboarding if not consented
- `apps/dashboard/src/hooks/useConsentStatus.ts` — React Query hook for checking consent status
- `packages/ui/src/components/dialog.tsx` — shadcn Dialog component (via CLI)
- `packages/ui/src/components/checkbox.tsx` — shadcn Checkbox component (via CLI)

### Modified files
- `apps/api/src/routes/consent.ts` — Added GET endpoint for checking consent status
- `apps/dashboard/src/routes/sign-up.tsx` — Changed `afterSignUpUrl` from `/dashboard` to `/onboarding`
- `apps/dashboard/src/App.tsx` — Added `/onboarding` route, wrapped dashboard routes with `ConsentGate`

## Behavioral notes

### Success path
1. User visits `/sign-up` → completes Clerk signup
2. Redirected to `/onboarding`
3. Onboarding polls `GET /consent` (1s interval, max 30 attempts)
4. When photographer exists: shows PDPA consent modal
5. User checks checkbox → clicks Accept → `POST /consent`
6. Redirected to `/dashboard`

### Key failure modes handled
- **Webhook race condition**: Polls for up to 30s waiting for photographer record
- **Polling timeout**: Shows error alert with Retry button
- **Consent API failure**: Shows error alert in modal with retry option
- **Already consented**: 409 from POST /consent treated as success
- **Direct dashboard access**: ConsentGate redirects to /onboarding if not consented

### `[KNOWN_LIMITATION]`
- PDPA consent copy is placeholder text (needs PM review)
- No UI tests added (dashboard has no existing test infrastructure)

## Ops / rollout

### Flags/env
- None required

### Migrations/run order
- No migrations required
- API GET /consent endpoint added (backward compatible)

## How to validate

### Commands run
- `pnpm build` — Build successful

### Key checks
- [ ] Full signup flow with Google OAuth
- [ ] Consent modal displays after signup
- [ ] Accept consent → redirects to dashboard
- [ ] Decline → shows explanation with retry/sign-out
- [ ] Sign out → returns to sign-in page
- [ ] Direct navigation to /dashboard without consent → redirects to /onboarding
- [ ] Refresh during consent → resumes correctly
- [ ] Mobile browser testing (Safari iOS, Chrome Android)

## Follow-ups

### `[PM_FOLLOWUP]`
- PDPA consent copy needs PM review and finalization
- Verify Clerk session lifetime is configured for 24h
- Test LINE in-app browser behavior

### `[ENG_DEBT]`
- Add UI tests for consent flow (Vitest + React Testing Library)
- Add loading skeleton to ConsentGate instead of simple spinner
