# Risk Scout Report

**Task:** T-6 — Signup UI + PDPA consent modal
**Root:** BS_0001_S-1
**Date:** 2026-01-10

## Executive Summary

T-6 involves integrating Clerk authentication UI with a blocking PDPA consent modal and session management. Key risks center around auth UX edge cases, mobile browser compatibility for Thai users, and proper integration with the T-5 consent API. The existing codebase has good auth infrastructure but lacks modal/dialog components and consent-checking logic in the UI layer.

---

## High-Impact Risks

### 1. Auth UX Timing Risks

**Risk:** Race condition between Clerk webhook (`user.created`) and UI consent modal display.

**Analysis:** The current flow is:
1. User completes Clerk signup
2. `user.created` webhook creates photographer row in DB (T-4)
3. UI redirects to dashboard
4. Dashboard needs photographer to exist for consent check

If the UI redirects before webhook completes, `requirePhotographer()` middleware will fail with 403 because photographer row does not exist yet.

**Evidence from codebase:**
- `apps/dashboard/src/routes/sign-up.tsx:10` uses `afterSignUpUrl="/dashboard"` for immediate redirect
- `apps/api/src/middleware/require-photographer.ts` expects photographer row to exist
- No polling/retry logic exists in dashboard

**Mitigation options:**
- A) Add polling in ProtectedRoute to retry photographer lookup with exponential backoff
- B) Have consent modal page use a separate "waiting" state while webhook processes
- C) Create photographer row synchronously during signup (not via webhook)

`[NEED_DECISION]` Which approach for handling webhook race condition?

---

### 2. PDPA Modal Blocking Behavior

**Risk:** Modal must block all dashboard access until consent given, but current `ProtectedRoute` only checks auth, not consent.

**Analysis:** Current flow allows authenticated users to reach `/dashboard` immediately:
- `apps/dashboard/src/components/auth/ProtectedRoute.tsx` only checks `isSignedIn`
- `apps/api/src/middleware/require-consent.ts` exists but is API-level, not UI-level
- No UI-level consent gate exists

**Implementation approach needed:**
```
ProtectedRoute
  |-- Check Clerk auth (exists)
  |-- Check photographer exists (needs adding)
  |-- Check PDPA consent (needs adding)
      |-- If no consent -> Show blocking modal
      |-- If consent given -> Allow route access
```

**Component gap:** No modal/dialog component in `packages/ui`. Only `button`, `card`, `alert` exist.

`[GAP]` Need to add `dialog` shadcn component: `pnpm --filter=@sabaipics/ui ui:add dialog`

---

### 3. Mobile Browser Compatibility (Thai Market)

**Risk:** Thai users primarily access via mobile, using LINE browser, Safari, Chrome. Clerk components and modals must work across all.

**Specific concerns:**
- LINE in-app browser has known quirks with OAuth redirects and popups
- iOS Safari viewport issues with fixed/sticky modals
- Older Android WebView versions (Samsung Internet, Oppo browser)

**Evidence:**
- Research doc `docs/logs/BS_0001_S-1/research/clerk-line-email.md` mentions LINE OAuth flow complexity
- No mobile-specific CSS or viewport handling in current codebase

**Testing requirements:**
- LINE in-app browser (iOS + Android)
- Safari iOS (15+)
- Chrome Android
- Samsung Internet

`[NEED_VALIDATION]` Test consent modal and Clerk OAuth flow in LINE in-app browser before launch

---

### 4. Clerk Missing Requirements Flow

**Risk:** LINE OAuth may not provide email; Clerk shows "missing requirements" flow that could confuse users or break the consent modal timing.

**Analysis from research:**
- `docs/logs/BS_0001_S-1/research/clerk-line-email.md` details that LINE does not provide email by default
- Clerk prebuilt `<SignUp />` component handles this automatically
- But the flow is: OAuth complete -> missing requirements -> email collection -> verification -> actual signup complete

**Impact on T-6:**
- `afterSignUpUrl="/dashboard"` may trigger before email is verified
- Webhook may fire without email if user abandons mid-flow
- Consent modal should only appear after full signup (including email verification)

**Mitigation:**
- Use Clerk's `status` checks to ensure signup is truly complete
- Consider `afterSignUpUrl` pointing to a dedicated `/onboarding` route that handles edge cases

`[NEED_DECISION]` Should consent modal be on `/dashboard` or a dedicated `/onboarding` route?

---

### 5. Session Persistence (24h Requirement)

**Risk:** Plan specifies 24h session persistence, but this is a Clerk configuration, not code.

**Analysis:**
- Decision #1 in plan: "Session timeout: 24 hours"
- Clerk default session lifetime may differ
- Mobile browsers aggressively clear localStorage/cookies

**Configuration checklist:**
- [ ] Clerk Dashboard > Sessions > Session lifetime = 24 hours
- [ ] Test session survival across browser restarts
- [ ] Test in LINE in-app browser (may not persist sessions)

`[NEED_VALIDATION]` Verify Clerk session settings are configured for 24h before deployment

---

### 6. API Integration with POST /consent (T-5)

**Risk:** UI must correctly call consent API and handle all response codes.

**Evidence from T-5 implementation:**
- `apps/api/src/routes/consent.ts` returns:
  - 201 on success
  - 409 if already consented (idempotent)
  - 401 if unauthenticated
  - 403 if photographer not found

**UI handling requirements:**
- Success (201): Close modal, allow dashboard access
- Already consented (409): Treat as success (idempotent)
- Auth error (401): Should not happen if modal is behind auth
- Not found (403): Could happen due to webhook race condition

**Code pattern from exemplar:**
```typescript
// From apps/dashboard/src/lib/api.ts
const { createAuthClient } = useApiClient();
const client = await createAuthClient();
const res = await client.consent.$post();
```

---

### 7. State Management for Consent Status

**Risk:** After consent is given, how does the app "remember" this state without re-fetching on every navigation?

**Options:**
- A) Fetch consent status on app mount, store in React context
- B) Include consent status in Clerk user metadata (requires API sync)
- C) Use React Query to cache `/dashboard` response which includes consent state

**Current state:**
- `packages/auth/src/hooks.ts:useAuth()` does not expose consent status
- No global state management (Redux, Zustand) in codebase
- React Query is configured in `apps/dashboard/src/main.tsx`

`[NEED_DECISION]` Consent state management approach: Context vs React Query cache?

---

## Decision Points (Human-in-Loop Required)

### [NEED_DECISION] Webhook Race Condition Strategy

**Context:** Clerk webhook may not complete before UI redirects after signup.

**Options:**
- A) Polling with backoff in UI (adds complexity, ~500ms-2s delay)
- B) Dedicated `/onboarding` route with loading state
- C) Synchronous photographer creation in custom signup flow (breaks prebuilt components)

**Recommendation:** Option B - simplest to implement, best UX

---

### [NEED_DECISION] Consent Modal Placement

**Context:** Where does the blocking PDPA modal appear?

**Options:**
- A) On `/dashboard` route (blocks dashboard content)
- B) On dedicated `/onboarding` route (cleaner separation)
- C) As a wrapper around `ProtectedRoute` (affects all protected routes)

**Recommendation:** Option B - allows specific handling of onboarding edge cases

---

### [NEED_DECISION] Consent State Management

**Context:** How to persist consent status client-side after it is given?

**Options:**
- A) React Context with initial fetch
- B) React Query cache (invalidate on consent success)
- C) Refetch on every navigation

**Recommendation:** Option B - already using React Query, leverages existing infrastructure

---

### [NEED_DECISION] Consent Decline Behavior

**Context:** Task spec says "Decline shows explanation with retry option" but does not specify:
- Can user sign out and try different account?
- Is there a "Contact support" option?
- How many times can user retry?

**Options:**
- A) Simple: Show explanation, "Try Again" button only
- B) Medium: Add "Use Different Account" (sign out) option
- C) Full: Add explanation, retry, sign out, and support contact

**Recommendation:** Option B - users may have signed up with wrong account

---

## Gaps

### [GAP] No Dialog/Modal Component

**Issue:** `packages/ui` has no modal component. PDPA consent modal needs one.

**Resolution:** Run `pnpm --filter=@sabaipics/ui ui:add dialog`

---

### [GAP] No Consent Check in UI Layer

**Issue:** `ProtectedRoute` only checks Clerk auth, not database consent status.

**Resolution:** Add consent status check that:
1. Fetches photographer consent status
2. Shows blocking modal if not consented
3. Allows route access if consented

---

### [GAP] No Error Boundary for Auth Flows

**Issue:** If consent API fails, no graceful error handling exists.

**Resolution:** Add error state in consent modal with retry option.

---

### [GAP] PDPA Copy Not Finalized

**Issue:** Task spec notes "PDPA copy needs PM review before launch" but no placeholder text exists.

`[PM_FOLLOWUP]` Provide PDPA consent copy text

---

### [GAP] LINE OAuth Email Permission

**Issue:** LINE email permission application not confirmed complete.

**Resolution:** Verify LINE Developer Console approval before LINE signups go live.

`[PM_FOLLOWUP]` Confirm LINE email permission status

---

## Merge Conflict Hotspots

### High Risk: `apps/dashboard/src/App.tsx`

**Reason:** Route definitions will change. Other tasks (T-11, T-12) will also modify this file.

**Mitigation:** Coordinate with other UI tasks, consider feature flags

---

### Medium Risk: `apps/dashboard/src/components/auth/ProtectedRoute.tsx`

**Reason:** Consent checking logic will be added. May conflict with future auth changes.

**Mitigation:** Extract consent check to separate hook (`useConsentGate`) to minimize file changes

---

### Medium Risk: `packages/ui/src/components/`

**Reason:** Adding dialog component. Other tasks may add components simultaneously.

**Mitigation:** Use shadcn CLI which creates isolated files

---

## Sensitive Areas

### Session/Token Handling

- `packages/auth/src/hooks.ts:getToken()` used for API auth
- Ensure token is fresh when calling consent API
- Handle token expiry gracefully (show re-auth prompt, not cryptic error)

### Privacy/PII

- IP address captured by consent API (T-5 already handles)
- Do not log user email in browser console
- Consent modal should not be bypassable via URL manipulation

---

## Implementation Checklist

### Pre-implementation

- [ ] Add dialog shadcn component
- [ ] Confirm Clerk session lifetime is 24h
- [ ] Get PDPA consent copy from PM
- [ ] Verify LINE email permission status

### Implementation

- [ ] Create consent status hook (`useConsentStatus`)
- [ ] Create PDPA consent modal component
- [ ] Create onboarding/consent route
- [ ] Update `ProtectedRoute` to check consent
- [ ] Update `afterSignUpUrl` to point to onboarding
- [ ] Handle all API response codes (201, 409, 401, 403)
- [ ] Add error state with retry
- [ ] Add sign-out option on decline

### Validation

- [ ] Test full signup flow (Google)
- [ ] Test full signup flow (LINE with email)
- [ ] Test full signup flow (LINE without email -> email collection)
- [ ] Test consent modal blocking behavior
- [ ] Test consent decline and retry
- [ ] Test on mobile: LINE in-app browser
- [ ] Test on mobile: Safari iOS
- [ ] Test on mobile: Chrome Android
- [ ] Test session persistence across browser restart

---

## Provenance

**Files examined:**
- `apps/dashboard/src/App.tsx` - routing structure
- `apps/dashboard/src/routes/sign-up.tsx` - current signup flow
- `apps/dashboard/src/routes/sign-in.tsx` - current signin flow
- `apps/dashboard/src/components/auth/ProtectedRoute.tsx` - auth gate
- `apps/dashboard/src/lib/api.ts` - API client hooks
- `apps/dashboard/src/main.tsx` - app bootstrap, providers
- `packages/auth/src/hooks.ts` - auth hooks interface
- `packages/auth/src/provider.tsx` - Clerk wrapper
- `packages/auth/src/components.tsx` - re-exported Clerk components
- `packages/ui/src/components/*.tsx` - available UI components
- `apps/api/src/routes/consent.ts` - consent API implementation (T-5)
- `apps/api/src/middleware/require-consent.ts` - consent middleware
- `docs/logs/BS_0001_S-1/tasks.md` - task definition
- `docs/logs/BS_0001_S-1/plan/final.md` - execution plan
- `docs/logs/BS_0001_S-1/research/clerk-line-email.md` - LINE OAuth research
- `docs/logs/BS_0001_S-1/context/risk-scout.md` - slice-level risk scout
