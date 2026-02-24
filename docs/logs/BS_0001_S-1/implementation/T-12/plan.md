# Implementation Plan

Task: `T-12 — Credit packages page UI`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-10`
Owner: `Claude (implementv3)`

## Inputs

- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: T-12)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-12/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-12/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-12/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-12/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-12/context/risk-scout.md`

## Goal / non-goals

**Goal:**

- Create dedicated `/credits/packages` page for browsing active credit packages
- Enable package selection → Stripe checkout → redirect flow
- Create `/credits/success` page for post-purchase confirmation
- Implement mobile-first, responsive UI following existing dashboard patterns

**Non-goals:**

- Package administration UI (Phase 0, admin API only)
- Email/LINE notifications for purchase completion
- Promo codes/discounts
- Subscription billing
- Purchase history page
- Automated UI tests (no test infrastructure yet, documented as ENG_DEBT)

## Approach (data-driven)

### Architecture

Following the **exact same pattern** as the existing dashboard page (`apps/dashboard/src/routes/dashboard/index.tsx`):

1. **Route structure:**
   - `/credits/packages` - PUBLIC route (no auth required for browsing)
   - `/credits/success` - PROTECTED route (auth + consent required)

2. **Component architecture:**
   - Page component: `apps/dashboard/src/routes/credits/packages/index.tsx`
   - Success page: `apps/dashboard/src/routes/credits/success/index.tsx`
   - Custom hook: `apps/dashboard/src/hooks/credits/useCreditPackages.ts`
   - Mutation hook: `apps/dashboard/src/hooks/credits/usePurchaseCheckout.ts`

3. **UI pattern (three-state rendering):**
   - Loading: `<Skeleton>` components matching card layout
   - Error: `<Alert variant="destructive">` with retry button
   - Success: Responsive card grid with package cards

4. **API integration:**
   - `GET /credit-packages` via React Query (public)
   - `POST /credit-packages/checkout` via React Query mutation (authenticated)
   - Redirect to Stripe-hosted checkout URL
   - Return to success page with `session_id` query param

### Evidence from codebase

**Pattern source:** `apps/dashboard/src/routes/dashboard/index.tsx` (lines 1-150)

- PageHeader with breadcrumbs and action buttons
- Three-state rendering (loading/error/success)
- Card grid layout with `md:grid-cols-3`
- Empty state handling with `<Empty>` component
- Error handling with retry button

**Data fetching source:** `apps/dashboard/src/hooks/dashboard/useDashboardData.ts` (lines 1-79)

- React Query `useQuery` with authentication
- Query key naming: `["feature-name"]`
- Bearer token from `useApiClient().getToken()`
- Response envelope: `{ data: T }`
- Config: `staleTime: 1000 * 60`, `refetchOnWindowFocus: true`

**Mutation source:** `apps/dashboard/src/routes/onboarding/_components/PDPAConsentModal.tsx` (lines 1-137)

- React Query `useMutation` for POST requests
- Loading state: `mutation.isPending`
- Error handling: `mutation.isError`
- Button spinner during mutation

**API contract source:** `apps/api/src/routes/credits.ts` (lines 36-159)

- GET endpoint returns `{ data: Array<{ id, name, credits, priceThb }> }`
- POST endpoint returns `{ data: { checkoutUrl, sessionId } }`
- Prices in satang (must divide by 100 for display)

### Critical constraint: Price formatting

From `logs-scout.md` and `upstream-dossier.md`:

- Prices stored in **satang** (1 THB = 100 satang)
- Example: `priceThb: 29900` = 299 THB
- **Must divide by 100 before display**
- Display format: `฿299` or `299 THB`

### Stripe checkout flow

From `codebase-exemplars.md` (Exemplar 6):

1. User clicks "Purchase" on package card
2. Frontend calls `POST /credit-packages/checkout` with `{ packageId }`
3. API returns `{ data: { checkoutUrl, sessionId } }`
4. Frontend redirects to `checkoutUrl` (Stripe-hosted page)
5. User completes payment or clicks cancel:
   - Success → Stripe redirects to `/credits/success?session_id={sessionId}`
   - Cancel → Stripe redirects to `/credits/packages`
6. Webhook fulfills credits asynchronously (T-10)
7. Dashboard balance auto-refreshes via `refetchOnWindowFocus`

## Contracts (only if touched)

### API (already implemented, consuming only)

**GET /credit-packages** (T-8, public endpoint):

```typescript
Response: {
  data: Array<{
    id: string; // UUID
    name: string; // "Starter", "Growth", etc.
    credits: number; // 100, 500, etc.
    priceThb: number; // in satang (29900 = 299 THB)
  }>;
}
```

**POST /credit-packages/checkout** (T-9, authenticated):

```typescript
Request: {
  packageId: string;   // UUID from packages list
}

Response: {
  data: {
    checkoutUrl: string;   // Stripe checkout URL
    sessionId: string;     // For success page
  }
}

Errors:
- 400: { error: { code: "INVALID_REQUEST", message: "..." } }
- 401: Not authenticated
- 403: No PDPA consent
- 404: Package not found
```

### DB

No direct database access. All data via API.

### Jobs/events

None. Webhook fulfillment handled by T-10.

## Success path

1. User navigates to `/credits/packages` (via dashboard "Buy Credits" button or direct URL)
2. Page fetches `GET /credit-packages` (public, no auth)
3. Loading state: Shows 3 skeleton cards
4. Success state: Renders package cards in responsive grid
5. User clicks "Purchase" on a package
6. Mutation calls `POST /credit-packages/checkout` (requires auth, triggers Clerk login if needed)
7. Loading state: Button shows spinner, disabled
8. Success: Redirect to `checkoutUrl` (Stripe-hosted page)
9. User completes payment on Stripe
10. Stripe redirects to `/credits/success?session_id={sessionId}`
11. Success page displays confirmation and link to dashboard
12. User returns to dashboard, balance auto-refreshes (T-11's `refetchOnWindowFocus`)

## Failure modes / edge cases (major only)

### 1. Network error during package fetch

- **Symptom:** `GET /credit-packages` fetch fails
- **Handling:** Show `<Alert variant="destructive">` with error message and retry button
- **Recovery:** User clicks retry → `refetch()` called

### 2. Network error during checkout creation

- **Symptom:** `POST /credit-packages/checkout` fetch fails
- **Handling:** Show error alert below package card with retry
- **Recovery:** User clicks "Purchase" again

### 3. User not authenticated during checkout

- **Symptom:** Clerk session expired or user logged out
- **Handling:** Clerk's `useApiClient()` redirects to `/sign-in` automatically
- **Recovery:** User signs in → redirected back to `/credits/packages` → retries purchase

### 4. User cancels Stripe checkout

- **Symptom:** User clicks "Back" or cancel on Stripe page
- **Handling:** Stripe redirects to `/credits/packages` (cancel URL)
- **Recovery:** User can select package again, no charge made

### 5. Payment fails on Stripe

- **Symptom:** Card decline, insufficient funds
- **Handling:** Stripe shows inline error, allows retry with different card
- **Recovery:** User retries or cancels back to packages page

### 6. Webhook delay after successful payment

- **Symptom:** User on success page but balance not updated yet
- **Handling:** Success page shows "Credits will appear in your account shortly" message
- **Recovery:** Dashboard `refetchOnWindowFocus` updates balance when user returns

### 7. Empty packages list

- **Symptom:** `GET /credit-packages` returns `{ data: [] }`
- **Handling:** Show `<Empty>` component with message "No packages available"
- **Recovery:** N/A (admin must activate packages)

### 8. Mobile network timeout

- **Symptom:** Slow network on mobile, fetch timeout
- **Handling:** Fetch throws error → error alert with retry
- **Recovery:** User retries with better connection

## Validation plan

### Manual testing checklist

**Desktop (Chrome, Safari, Firefox):**

- [ ] Navigate to `/credits/packages`
- [ ] Verify packages load correctly (name, credits, price in THB)
- [ ] Verify loading skeletons display during fetch
- [ ] Simulate network error (DevTools offline mode) → verify error alert + retry
- [ ] Click "Purchase" on a package
- [ ] Verify redirect to Stripe checkout page
- [ ] Complete test payment (card: 4242 4242 4242 4242)
- [ ] Verify redirect to `/credits/success?session_id=...`
- [ ] Verify success page shows confirmation
- [ ] Click "Return to Dashboard" → verify navigation
- [ ] Verify dashboard balance updates (may take 1-5 seconds)

**Mobile (iOS Safari, Android Chrome):**

- [ ] Test responsive layout (cards stack vertically)
- [ ] Test Stripe checkout redirect flow
- [ ] Test PromptPay QR flow (if available in test mode)
- [ ] Test "Back" button during checkout → verify cancel URL works
- [ ] Test slow network (DevTools throttle to Slow 3G)

**Edge cases:**

- [ ] Test unauthenticated user clicking "Purchase" → verify Clerk login redirect
- [ ] Test cancel flow (click back on Stripe page) → verify return to packages
- [ ] Test direct navigation to `/credits/success` without session_id → verify error handling

### Build commands

```bash
# Type check
pnpm check-types

# Build dashboard
pnpm --filter=@sabaipics/dashboard build

# Run dev server for manual testing
pnpm dev
```

### Tests to add

**Unit tests:** SKIPPED (no test infrastructure)

- Document as `[ENG_DEBT]` in summary

**Integration tests:** SKIPPED (no E2E framework)

- Document as `[ENG_DEBT]` in summary

## Rollout / rollback

### Rollout

1. **Prerequisites:**
   - T-8 (Credit packages API) deployed ✓
   - T-9 (Stripe checkout API) deployed ✓
   - T-10 (Webhook handler) deployed ✓
   - Stripe API keys configured in production ✓

2. **Deployment:**
   - Build dashboard: `pnpm --filter=@sabaipics/dashboard build`
   - Deploy to Cloudflare Pages: `pnpm --filter=@sabaipics/dashboard pages:deploy`

3. **Verification:**
   - Navigate to production `/credits/packages`
   - Verify packages load from production API
   - Test full purchase flow with live Stripe account (small amount)
   - Verify webhook fulfillment
   - Verify dashboard balance updates

4. **Monitoring:**
   - Check Stripe Dashboard for checkout session creation
   - Check webhook delivery logs
   - Monitor Sentry/logs for frontend errors

### Rollback

**Low risk:** UI-only change, no database migrations or API changes.

**If needed:**

1. Revert dashboard deployment on Cloudflare Pages (instant)
2. Old `/credits/packages` route will 404 (acceptable, dashboard "Buy Credits" button exists but doesn't work)
3. API endpoints remain functional for future retry

**No data cleanup needed** (no writes to database from UI).

## Open questions

None. All context reports confirm:

- APIs implemented and tested
- Contracts clear
- Patterns established
- No new primitives needed
- **GREEN** status for implementation
