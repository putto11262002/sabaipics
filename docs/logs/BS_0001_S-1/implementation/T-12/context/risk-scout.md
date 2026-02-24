# Risk Scout

Task: T-12 — Credit packages page UI
Root: BS_0001_S-1
Date: 2026-01-10

## High-risk items (require HI gate)

None identified. T-12 is a straightforward UI task with well-defined backend APIs already in place.

## Medium-risk items (validate during planning)

1. **Stripe redirect UX clarity**
   - Users will redirect away from the app to Stripe-hosted checkout
   - Need clear messaging: "Redirecting to secure payment..." / "Powered by Stripe"
   - Success/cancel URLs must be correct in all environments (dev, staging, prod)

2. **Credit balance refresh after purchase**
   - After returning from Stripe, dashboard may show stale balance
   - Webhook fulfillment is async (Stripe sends webhook after checkout)
   - Solution: Dashboard already has `refetchOnWindowFocus: true` in useDashboardData hook (line 54)
   - Consider showing a "Processing your purchase..." banner on success page

3. **Network error handling during checkout API call**
   - `POST /credits/checkout` may fail (network, validation, Stripe API down)
   - Need user-friendly error messages with retry option
   - Error states: Invalid package, insufficient credits check (if any), Stripe API failure

4. **Mobile UX for payment flow**
   - Target market: Thai photographers (mobile-heavy)
   - Stripe Checkout is responsive, but test redirect flow on mobile browsers
   - PromptPay QR code scanning requires mobile browser → banking app → return to browser

## Coupling / dependencies discovered

### Direct API dependencies (already implemented)

- **T-8 (Credit Packages API)**: `GET /credits/packages` - DONE (PR #13)
- **T-9 (Stripe Checkout API)**: `POST /credits/checkout` - DONE (PR #15)
- **T-10 (Stripe Webhook)**: Fulfillment logic - DONE (PR #17)

### Indirect dependencies

- **T-7 (Dashboard API)**: Credit balance display on success page - DONE (PR #12)
- **Auth middleware**: `requirePhotographer()` + `requireConsent()` for checkout endpoint - DONE
- **Stripe configuration**: Environment variables (STRIPE_SECRET_KEY, CORS_ORIGIN) must be set

### Shared state

- **React Router**: Navigation between `/credits/packages`, success page, and dashboard
- **React Query**: Credit balance refresh after purchase (revalidation strategy)
- **Auth context**: Clerk session token for API calls

### No hidden coupling found

- Credit package selection is stateless (UI → API with package ID)
- No shared forms or complex state management needed
- Success page can fetch checkout session details directly from URL params (`session_id`)

## API contract assumptions

### `GET /credits/packages` (T-8)

**Contract:**

```typescript
Response: {
  data: Array<{
    id: string; // UUID
    name: string; // e.g. "Starter"
    credits: number; // e.g. 100
    priceThb: number; // in satang (e.g. 29900 = 299 THB)
  }>;
}
```

**Status:** Implemented and tested (apps/api/src/routes/credits.ts, lines 36-50)
**Notes:**

- Public endpoint (no auth required)
- Only returns active packages
- Sorted by sortOrder ascending
- Price is in satang (multiply by 100 from THB)

### `POST /credits/checkout` (T-9)

**Contract:**

```typescript
Request: {
  packageId: string;  // UUID from packages list
}

Response: {
  data: {
    checkoutUrl: string;   // Stripe-hosted checkout page
    sessionId: string;     // For success page retrieval
  }
}

Errors:
- 400: Invalid packageId (missing or wrong type)
- 404: Package not found or inactive
- 401: Not authenticated
- 403: No PDPA consent
```

**Status:** Implemented (apps/api/src/routes/credits.ts, lines 61-159)
**Notes:**

- Requires auth + consent (middleware: requirePhotographer, requireConsent)
- Creates or retrieves Stripe customer for photographer
- Checkout session includes metadata: photographer_id, package_id, credits
- Success URL: `{CORS_ORIGIN}/credits/success`
- Cancel URL: `{CORS_ORIGIN}/credits/packages`

### Assumptions validated

1. **Credit packages are stored in database** - YES (credit_packages table exists)
2. **Checkout API returns URL immediately** - YES (synchronous response)
3. **Fulfillment happens via webhook** - YES (webhook handler in place, idempotent)
4. **No pre-purchase credit balance check** - CONFIRMED (any photographer can attempt purchase)
5. **PromptPay enabled** - To verify in Stripe Dashboard, not a code issue

## Security considerations

### Payment security

- **PCI compliance**: Handled entirely by Stripe (no card data touches our system)
- **Checkout session security**:
  - Session IDs are one-time use
  - Stripe verifies redirect origin
  - Webhook signature verification prevents tampering (line 160-165 in webhooks/stripe.ts)

### Authorization

- **Checkout endpoint**: Requires `requirePhotographer()` + `requireConsent()` middleware
- **Package listing**: Public (no auth) - acceptable, prices are not sensitive
- **Success page**: Should verify session belongs to current photographer (fetch via Stripe API if needed)

### PII handling

- **Customer data**: Email and name sent to Stripe (already done in T-9)
- **Metadata**: photographer_id stored in Stripe metadata (acceptable, not displayed to user)
- **Logging**: Webhook logs payment details - ensure no card numbers logged (verified: only session/customer IDs)

### CSRF protection

- **API calls**: Bearer token auth (Clerk JWT) prevents CSRF
- **Stripe redirect**: Stripe handles CSRF for checkout session

## Edge cases to handle

### Payment failures

1. **Insufficient funds / Card decline**
   - Stripe shows error inline on checkout page
   - User can retry with different card
   - Cancel button returns to `/credits/packages`
   - No credits deducted (webhook not triggered)

2. **Stripe API down during checkout creation**
   - `POST /credits/checkout` returns 500
   - UI should show: "Payment system temporarily unavailable. Please try again in a few moments."
   - Provide retry button

3. **Payment expired (user doesn't complete checkout)**
   - Checkout session expires after 24 hours
   - Webhook receives `checkout.session.expired` (logged, no action needed)
   - User can create new session by clicking package again

### Network errors

1. **Network failure during POST /credits/checkout**
   - Fetch throws error
   - UI should catch and show: "Network error. Please check your connection and try again."
   - Retry button

2. **User closes tab during Stripe redirect**
   - No problem: Can return to `/credits/packages` and retry
   - No double-charge risk (new session created)

### Already purchased scenarios

1. **User clicks "Buy Credits" multiple times**
   - Each click creates a new checkout session (expected behavior)
   - Only completed sessions trigger fulfillment
   - Idempotency in webhook prevents double credit grant

2. **User completes payment but balance doesn't update immediately**
   - Webhook may take 1-5 seconds to arrive
   - Dashboard refetch on focus helps
   - Success page should show: "Purchase complete! Credits will appear in your account shortly."
   - Auto-refresh success page every 2-3 seconds until balance updates?

### Race conditions

1. **User navigates away before webhook arrives**
   - Not a problem: Webhook still processes, credits added
   - Dashboard shows updated balance on next visit

2. **Multiple browser tabs**
   - Each tab can create checkout session (harmless, only completed sessions fulfilled)
   - React Query cache shared across tabs helps with balance consistency

### Mobile-specific edge cases

1. **PromptPay flow**: Mobile browser → Banking app → Return to browser
   - Stripe handles redirect back automatically
   - Test on Thai banking apps (SCB, Kbank, Bangkok Bank)

2. **Slow mobile network**
   - Show loading spinner during checkout creation
   - Set fetch timeout (e.g., 15 seconds) with clear error message

3. **User uses "Back" button after Stripe redirect**
   - Browser back to `/credits/packages` (cancel URL)
   - No charges made, safe to retry

## Notes

### Implementation dependencies (all complete)

- T-8: Credit packages API (GET /credits/packages) - DONE
- T-9: Stripe checkout API (POST /credits/checkout) - DONE
- T-10: Stripe webhook fulfillment - DONE
- Dashboard API: Credit balance display - DONE

### UI architecture considerations

- **Framework**: React + React Router + TanStack Query (already in use)
- **Components needed**:
  - Package card component (price, credits, description, "Buy" button)
  - Loading states (package list loading, checkout creation loading)
  - Error states (API errors, network errors)
  - Success page component (confirmation, receipt summary, "Back to Dashboard" button)
  - Cancel page (optional, or reuse packages page with message)

### Existing patterns to follow

- **Auth**: `useApiClient()` hook for authenticated calls (apps/dashboard/src/lib/api.ts)
- **Data fetching**: TanStack Query hooks (see useDashboardData.ts)
- **Page layout**: `<PageHeader>` + content grid (see dashboard/index.tsx)
- **UI components**: shadcn/ui from `@sabaipics/ui/components/*`

### Environment config assumptions

- `VITE_API_URL`: API base URL (already used in dashboard)
- `CORS_ORIGIN`: Set in API wrangler.jsonc for success/cancel URLs (verified)

### Testing considerations (not blocking for implementation)

- **Unit tests**: Package card component, loading/error states
- **Integration tests**: Full purchase flow (Stripe test mode)
- **E2E tests**: Redirect to Stripe, return to success page
- **Manual testing checklist**:
  - [ ] Test on Chrome/Safari/Firefox
  - [ ] Test on iOS Safari (PromptPay)
  - [ ] Test on Android Chrome (PromptPay)
  - [ ] Test slow network (throttle in DevTools)
  - [ ] Test Stripe test mode (use test card: 4242 4242 4242 4242)
  - [ ] Test PromptPay test mode (Stripe provides test QR)

### Post-launch monitoring (out of scope for T-12)

- Monitor checkout session creation errors
- Monitor webhook fulfillment success rate
- Track time between purchase and credit balance update
- Track mobile vs desktop purchase rates
- A/B test: Embedded checkout vs redirect (future enhancement per research)

### Known limitations (acceptable for MVP)

1. No package comparison or recommendations ("Most Popular" badge)
2. No discount codes (Stripe supports this, but not in scope)
3. No purchase history page (can add later)
4. No email receipt (Stripe sends this automatically)
5. No refund UI (admin-only operation for now)

### Risk assessment summary

| Risk Category       | Level  | Mitigation                            |
| ------------------- | ------ | ------------------------------------- |
| Payment security    | LOW    | Stripe handles all sensitive data     |
| Authorization       | LOW    | Middleware in place, tested           |
| API availability    | MEDIUM | Error handling + retry UX             |
| Network failures    | MEDIUM | Clear error messages, retry buttons   |
| Mobile UX           | MEDIUM | Test on target devices (Thai market)  |
| Race conditions     | LOW    | Idempotent webhook, React Query cache |
| Credit balance sync | LOW    | Auto-refetch on window focus          |

### Recommendation

**Proceed with implementation.** All dependencies are complete, API contracts are clear, and risks are manageable with proper error handling. No HI gates required.

**Critical path:**

1. Create `/credits/packages` route
2. Fetch and display packages (loading/error/success states)
3. Handle "Buy" button → call checkout API → redirect to Stripe URL
4. Create `/credits/success` page (show session details, link to dashboard)
5. Test full flow in Stripe test mode
6. Manual QA on mobile devices

**Estimated effort:** 1-2 days (including testing)
