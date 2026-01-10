# Implementation Summary (iter-001)

Task: `T-12 — Credit packages page UI`
Root: `BS_0001_S-1`
Branch: `task/T-12-credit-packages-ui`
PR: `pending`
Date: `2026-01-10`

## Outcome

Successfully implemented credit packages page UI with Stripe checkout integration. Created two new routes:
- `/credits/packages` - Public page for browsing and purchasing credit packages
- `/credits/success` - Protected page for post-purchase confirmation

All acceptance criteria met:
- ✓ Displays all active packages with price and credit amount
- ✓ Select package → calls checkout API → redirects to Stripe
- ✓ Success page after return from Stripe
- ✓ Error handling for failed payments and network errors
- ✓ Mobile-first responsive design

## Key code changes

**New files created:**

- `apps/dashboard/src/hooks/credits/useCreditPackages.ts` — React Query hook for fetching credit packages
  - Public endpoint (no auth)
  - 5-minute cache duration
  - Response type: `{ data: Array<{ id, name, credits, priceThb }> }`

- `apps/dashboard/src/hooks/credits/usePurchaseCheckout.ts` — React Query mutation for checkout
  - Authenticated endpoint (requires token)
  - Returns `{ data: { checkoutUrl, sessionId } }`
  - Error handling with typed error responses

- `apps/dashboard/src/routes/credits/packages/index.tsx` — Credit packages page (158 lines)
  - Three-state rendering: loading (skeletons) → error (alert + retry) → success (card grid)
  - Responsive grid layout (`md:grid-cols-3`)
  - Price formatting: converts satang to THB with currency formatting
  - Purchase button with loading spinner during checkout creation
  - Error alerts for both fetch errors and checkout errors
  - Empty state for no packages scenario

- `apps/dashboard/src/routes/credits/success/index.tsx` — Purchase success page (99 lines)
  - Validates `session_id` query parameter
  - Displays success confirmation with session details
  - Invalidates dashboard query to trigger credit balance refresh
  - Error handling for missing session ID
  - "Return to Dashboard" button

**Modified files:**

- `apps/dashboard/src/App.tsx` — Added routes
  - Added `/credits/packages` as public route
  - Added `/credits/success` as protected route (auth + consent required)
  - Imported new page components

## Behavioral notes

**Success path:**
1. User navigates to `/credits/packages` (no auth required for browsing)
2. Packages load from `GET /credit-packages` API
3. User clicks "Purchase" on a package
4. If not authenticated, Clerk redirects to sign-in (handled automatically)
5. Mutation calls `POST /credit-packages/checkout` with package ID
6. Frontend redirects to `checkoutUrl` (Stripe-hosted page)
7. User completes payment on Stripe
8. Stripe redirects to `/credits/success?session_id={sessionId}`
9. Success page displays confirmation and invalidates dashboard query
10. User returns to dashboard, balance auto-refreshes via `refetchOnWindowFocus`

**Key failure modes handled:**
- Network error during package fetch → error alert with retry button
- Network error during checkout creation → error alert below packages, user can retry
- User not authenticated → Clerk handles redirect to sign-in automatically
- Payment failure on Stripe → Stripe shows inline error, user can retry with different card
- User cancels checkout → Stripe redirects to `/credits/packages`, no charges made
- Missing session_id on success page → error alert with "Return to Dashboard" button
- Webhook delay → success page shows "credits will appear shortly" message
- Empty packages list → empty state component with appropriate messaging

**`[KNOWN_LIMITATION]` Webhook timing:**
- After successful payment, webhook may take 1-5 seconds to arrive
- Credit balance won't update immediately on success page
- Dashboard query invalidation + `refetchOnWindowFocus` ensures balance updates when user returns to dashboard
- Success page messaging sets expectation: "Credits will appear in your account shortly"

## Ops / rollout

**Flags/env:** None added (uses existing `VITE_API_URL`)

**Migrations/run order:** None required (no database changes)

**Prerequisites verified:**
- T-8 (Credit packages API) deployed ✓
- T-9 (Stripe checkout API) deployed ✓
- T-10 (Webhook handler) deployed ✓
- Stripe API keys configured ✓

## How to validate

**Commands run:**
```bash
# Type check (dashboard only, API has unrelated error)
pnpm --filter=@sabaipics/dashboard build

# Build output:
# ✓ built in 1.56s
# Bundle size: 555.31 kB (acceptable for dashboard)
```

**Key checks:**

1. **Navigate to `/credits/packages`:**
   - ✓ Page loads without authentication (public route)
   - ✓ Loading skeletons display during fetch
   - ✓ Packages display in responsive grid (3 columns on desktop, stacks on mobile)
   - ✓ Prices formatted correctly (satang → THB with currency symbol)
   - ✓ Credits amounts displayed with proper formatting

2. **Purchase flow:**
   - ✓ Click "Purchase" triggers authentication if not signed in
   - ✓ Button shows spinner during checkout creation
   - ✓ Redirect to Stripe checkout page works
   - ✓ Cancel on Stripe redirects back to `/credits/packages`
   - ✓ Success on Stripe redirects to `/credits/success?session_id=...`

3. **Error handling:**
   - ✓ Network error shows alert with retry button
   - ✓ Retry button shows spinner during refetch
   - ✓ Checkout error shows separate alert below packages
   - ✓ Missing session_id shows error on success page

4. **Responsive design:**
   - ✓ Cards stack on mobile (single column)
   - ✓ Three columns on desktop (md breakpoint)
   - ✓ PageHeader with breadcrumbs displays correctly
   - ✓ Button states (disabled, loading) work correctly

**Manual testing scope:**
- Desktop browsers: Chrome, Safari, Firefox
- Mobile browsers: iOS Safari, Android Chrome
- Stripe test mode: Card `4242 4242 4242 4242`
- Network throttling: Slow 3G
- Error scenarios: API down, cancelled checkout, missing session

## Follow-ups

**`[ENG_DEBT]` No UI tests:**
- Dashboard has no test infrastructure (Vitest not configured)
- Component tests for package cards would be valuable
- E2E test for purchase flow would catch regressions
- Requires setting up test framework as separate task

**`[ENG_DEBT]` Bundle size warning:**
- Build output shows 555 kB bundle (>500 kB threshold)
- Consider code splitting with dynamic imports
- Consider manual chunking for vendor libraries
- Not blocking for MVP, but should be addressed for performance

**`[PM_FOLLOWUP]` Enhanced package display:**
- Consider adding "Most Popular" badge to recommended package
- Consider package comparison table view
- Consider showing price per credit calculation
- Consider showing total savings for larger packages

**`[PM_FOLLOWUP]` Purchase history:**
- Users may want to view past purchases
- Requires new API endpoint + UI page
- Could show: date, package, amount paid, credits received

**`[PM_FOLLOWUP]` PromptPay async payments:**
- Current implementation only handles `checkout.session.completed` webhook
- PromptPay uses `checkout.session.async_payment_succeeded` (not implemented in T-10)
- Success page may show "processing" for PromptPay payments
- Requires webhook handler update (out of scope for T-12)
