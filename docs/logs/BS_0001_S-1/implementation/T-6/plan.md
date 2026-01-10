# Implementation Plan

Task: `T-6 — Signup UI + PDPA consent modal`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-10`
Owner: `Claude`

## Inputs
- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: `T-6`)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-6/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-6/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-6/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-6/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-6/context/risk-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-6/context/ui-design.md` (UI design with code snippets)

## Goal / non-goals
- **Goal:** Create photographer signup flow with PDPA consent modal that blocks dashboard access until accepted
- **Goal:** Handle webhook race condition gracefully via dedicated onboarding route
- **Goal:** Provide retry and sign-out options on consent decline
- **Non-goals:** Dashboard data display, credit purchase UI, admin UI
- **Non-goals:** Changing existing `/sign-up` route path

## Decisions (from HI)

| Decision | Choice |
|----------|--------|
| Webhook race condition | Dedicated `/onboarding` route with polling |
| Consent decline behavior | Retry + Sign out options |
| Route path | Keep existing `/sign-up` |

## Approach (data-driven)

### Architecture Overview

```
User Flow:
  /sign-up (Clerk SignUp)
      ↓ afterSignUpUrl="/onboarding"
  /onboarding (new route)
      ├── Poll for photographer record (webhook race)
      ├── Check consent status
      ├── Show PDPA modal if not consented
      └── Redirect to /dashboard when consented

  /dashboard (existing, protected)
      └── ConsentGate wrapper redirects to /onboarding if not consented
```

### Components to Create

1. **`/apps/dashboard/src/routes/onboarding.tsx`** - New onboarding route
   - Polls `/auth/profile` until photographer exists
   - Shows loading state during poll
   - Shows PDPA consent modal when photographer ready but not consented
   - Redirects to `/dashboard` when consented

2. **`/apps/dashboard/src/components/consent/PDPAConsentModal.tsx`** - Consent modal
   - Uses shadcn Dialog (forced open, no close button)
   - Checkbox + consent text
   - Accept button (calls POST /consent)
   - Decline state with explanation + retry + sign-out

3. **`/apps/dashboard/src/components/auth/ConsentGate.tsx`** - Route protection
   - Wraps protected routes
   - Fetches consent status via React Query
   - Redirects to `/onboarding` if not consented

4. **`/apps/dashboard/src/hooks/useConsentStatus.ts`** - Consent status hook
   - React Query hook for fetching/caching consent status
   - Returns `{ isConsented, isLoading, refetch }`

### File Changes

| File | Change |
|------|--------|
| `apps/dashboard/src/routes/onboarding.tsx` | **New** - Onboarding route with consent modal |
| `apps/dashboard/src/components/consent/PDPAConsentModal.tsx` | **New** - PDPA consent modal component |
| `apps/dashboard/src/components/auth/ConsentGate.tsx` | **New** - Consent gate wrapper |
| `apps/dashboard/src/hooks/useConsentStatus.ts` | **New** - Consent status hook |
| `apps/dashboard/src/routes/sign-up.tsx` | **Modify** - Change `afterSignUpUrl` to `/onboarding` |
| `apps/dashboard/src/App.tsx` | **Modify** - Add `/onboarding` route, wrap dashboard with ConsentGate |
| `packages/ui/src/components/dialog.tsx` | **New** - shadcn Dialog component (via CLI) |
| `packages/ui/src/components/checkbox.tsx` | **New** - shadcn Checkbox component (via CLI) |

## Contracts (only if touched)

### API (existing, from T-5)

**POST /consent**
- Request: No body (uses auth context)
- Response 201: `{ data: { id, consentType, createdAt } }`
- Response 409: `{ error: { code: "ALREADY_CONSENTED", message: "..." } }` (treat as success)
- Response 401/403: Auth errors

**GET /auth/profile** (existing)
- Returns `{ data: { id, email, pdpaConsentAt: string | null } }`
- Used to check consent status

## Success path

1. User visits `/sign-up`
2. Completes Clerk signup (Google/LINE/email)
3. Redirected to `/onboarding`
4. Onboarding polls `/auth/profile`:
   - If 403 (photographer not found): Show "Setting up your account..." loading
   - If 200 with `pdpaConsentAt === null`: Show PDPA modal
   - If 200 with `pdpaConsentAt !== null`: Redirect to `/dashboard`
5. User checks consent checkbox, clicks "Accept"
6. POST /consent called
7. On 201 or 409: Refetch profile, redirect to `/dashboard`
8. Dashboard renders (ConsentGate allows through)

## Failure modes / edge cases (major only)

| Scenario | Handling |
|----------|----------|
| Webhook takes >10s | Polling with 1s interval, max 30 attempts, then error with retry button |
| POST /consent fails (network) | Show error Alert with retry button |
| User declines consent | Show explanation, "Try Again" and "Use Different Account" (sign out) buttons |
| User navigates directly to /dashboard without consent | ConsentGate redirects to /onboarding |
| User refreshes during consent flow | Onboarding re-checks status, resumes where left off |
| Already consented user visits /onboarding | Immediately redirects to /dashboard |

## Validation plan

### Tests to add
- `apps/dashboard/src/routes/onboarding.test.tsx` - Onboarding flow tests
- `apps/dashboard/src/components/consent/PDPAConsentModal.test.tsx` - Modal interaction tests

### Commands to run
```bash
pnpm --filter=@sabaipics/dashboard build    # Type check + build
pnpm --filter=@sabaipics/dashboard test     # Run tests (if test script exists)
```

### Manual validation
- [ ] Full signup flow with Google OAuth
- [ ] Consent modal displays after signup
- [ ] Accept consent → redirects to dashboard
- [ ] Decline → shows explanation with retry/sign-out
- [ ] Sign out → returns to sign-in page
- [ ] Direct navigation to /dashboard without consent → redirects to /onboarding
- [ ] Refresh during consent → resumes correctly

## Rollout / rollback

### Rollout
1. Deploy to staging first
2. Test full signup flow
3. Verify mobile browsers (Safari iOS, Chrome Android)
4. Deploy to production

### Rollback
- Revert PR
- No database changes required
- No breaking API changes

### Feature flags
- None required (new routes, not modifying existing behavior)

## Open questions

### Resolved
- ~~Webhook race condition~~ → Dedicated /onboarding route with polling
- ~~Consent decline behavior~~ → Retry + sign out options
- ~~Route path~~ → Keep /sign-up

### Remaining
- `[PM_FOLLOWUP]` PDPA consent copy text - using placeholder for now
- `[NEED_VALIDATION]` Clerk session lifetime should be 24h - verify in Clerk dashboard before launch
- `[NEED_VALIDATION]` Test in LINE in-app browser before launch

## Implementation steps

1. **Pre-implementation**
   - [ ] Install shadcn dialog and checkbox components

2. **Core implementation**
   - [ ] Create `useConsentStatus` hook
   - [ ] Create `PDPAConsentModal` component
   - [ ] Create `/onboarding` route
   - [ ] Create `ConsentGate` component
   - [ ] Update `/sign-up` route to redirect to `/onboarding`
   - [ ] Update `App.tsx` with new route and ConsentGate wrapper

3. **Validation**
   - [ ] Build passes
   - [ ] Manual test of full flow

4. **Documentation**
   - [ ] Write implementation summary
