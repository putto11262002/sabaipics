# Implementation Plan

Task: `T-9 — Stripe checkout API`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-10`
Owner: `implementv3 skill`

## Inputs

- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: `T-9`)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Research: `docs/logs/BS_0001_S-1/research/stripe-credit-flow.md`

## Goal / Non-goals

**Goal:**
Create `POST /credits/checkout` endpoint that creates a Stripe Checkout session for the selected credit package, enabling photographers to purchase credits via PromptPay/card.

**Non-goals:**

- Webhook fulfillment (handled by T-10)
- Success/cancel page UI (handled by T-12)
- Admin UI for managing packages
- Stripe customer creation on first purchase (customer will be created in webhook handler T-10)

## Approach (Data-Driven)

### Existing Infrastructure (Leverage, Don't Rebuild)

| Component                          | Location                                          | Status     | Usage                              |
| ---------------------------------- | ------------------------------------------------- | ---------- | ---------------------------------- |
| `createCheckoutSession()`          | `apps/api/src/lib/stripe/checkout.ts`             | Ready      | Creates checkout with `price_data` |
| `getOrCreateCustomer()`            | `apps/api/src/lib/stripe/customer.ts`             | Ready      | Customer management                |
| `creditPackages` table             | `packages/db/src/schema/credit-packages.ts`       | Done (T-3) | Package source of truth            |
| `requirePhotographer()` middleware | `apps/api/src/middleware/require-photographer.ts` | Ready      | Auth enforcement                   |
| `GET /credit-packages`             | `apps/api/src/routes/credits.ts`                  | Done (T-8) | Public endpoint                    |

### Implementation Strategy

1. **Add checkout endpoint to existing credits router**
   - File: `apps/api/src/routes/credits.ts`
   - Route: `POST /checkout`
   - Auth: `requirePhotographer()` + `requireConsent()`

2. **Request/Response contract**

   ```typescript
   // Request
   POST /credits/checkout
   { packageId: string }

   // Success Response (200)
   {
     data: {
       checkoutUrl: string,
       sessionId: string
     }
   }

   // Error Responses
   400 - Invalid package ID
   404 - Package not found or inactive
   ```

3. **Validation flow**

   ```
   1. Extract packageId from request body
   2. Query credit_packages WHERE id = packageId AND active = true
   3. If not found → 404
   4. Get/create Stripe customer for photographer
   5. Call createCheckoutSession() with:
      - package name, priceTHB, credits
      - metadata: { photographer_id, package_id, credits }
      - success_url: /credits/success?session_id={CHECKOUT_SESSION_ID}
      - cancel_url: /credits/packages
   6. Return { checkoutUrl, sessionId }
   ```

4. **Stripe Customer Handling** (`[NEED_DECISION]`)
   - **Option A:** Create customer in checkout endpoint (simpler, customerId available immediately)
   - **Option B:** Create customer in webhook handler (T-10) using metadata

   **Research Finding:** Existing codebase has `findCustomerByPhotographerId()` which can search by metadata. However, searching is slower than direct lookup.

   **Recommendation:** Store `stripe_customer_id` on `photographers` table (schema already has field). Create customer in checkout endpoint if not set.

## Contracts

### API Contract

```
POST /credits/checkout
Authorization: Bearer <Clerk token>

Request Body:
{
  "packageId": "uuid"
}

Response 200:
{
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/...",
    "sessionId": "cs_test_..."
  }
}

Error 400:
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "packageId is required"
  }
}

Error 404:
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Credit package not found"
  }
}
```

### Metadata Passed to Stripe

```typescript
metadata: {
  photographer_id: string,  // For webhook fulfillment
  package_id: string,       // For analytics/reconciliation
  package_name: string,     // For Stripe Dashboard readability
  credits: string           // For webhook fulfillment (amount to add)
}
```

## Success Path

1. Photographer clicks "Buy Credits" on credit packages page
2. Frontend calls `POST /credits/checkout` with selected `packageId`
3. API validates package exists and is active
4. API gets/creates Stripe customer for photographer
5. API creates Stripe Checkout session with package details
6. API returns `{ checkoutUrl, sessionId }`
7. Frontend redirects to `checkoutUrl`
8. Photographer completes payment on Stripe-hosted page
9. Stripe sends `checkout.session.completed` webhook (T-10)

## Failure Modes / Edge Cases

| Scenario                     | Handling                                         |
| ---------------------------- | ------------------------------------------------ |
| Invalid UUID for packageId   | 400 error with clear message                     |
| Package not found            | 404 with "Credit package not found"              |
| Package inactive             | 404 (same as not found - hide inactive packages) |
| Stripe API error             | 500 with error details, logged                   |
| Photographer has no email    | Use clerk email from auth context                |
| Photographer has no name     | Optional in Stripe, skip                         |
| Concurrent checkout requests | Stripe handles idempotency via metadata          |

## Validation Plan

### Tests to Add

1. **Unit test** (new file: `apps/api/src/routes/credits.test.ts` or extend existing)
   - Mock `createCheckoutSession()`
   - Test package validation (active/inactive)
   - Test request/response format

2. **Manual validation**
   - Use Stripe test mode
   - Verify checkout session creation in Stripe Dashboard
   - Test with real package IDs from DB

### Commands to Run

```bash
# Run tests
pnpm --filter=@sabaipics/api test

# Local dev (with Stripe test keys)
pnpm dev

# Check Stripe Dashboard for created sessions
```

## Rollout / Rollback

### Rollout

1. Merge to master → deploys to staging
2. Verify endpoint works in staging with Stripe test keys
3. Deploy to production (manual approval via Cloudflare)
4. Enable in production with Stripe live keys

### Rollback

If critical issues discovered:

1. Revert PR
2. Deploy revert to staging → production
3. Any checkout sessions created before rollback will still complete (webhook may fail safely)

### Flags / Env Vars

No new flags required. Uses existing:

- `STRIPE_SECRET_KEY` (test/live)
- `STRIPE_WEBHOOK_SECRET` (for T-10)

## Open Questions

### `[RESOLVED]` Stripe Customer Handling

**Finding:** The `photographers` table does **not** have a `stripeCustomerId` column.

**Approach:** Use `findCustomerByPhotographerId()` from existing `customer.ts` to search by metadata. This is acceptable for MVP.

**Future optimization:** Add `stripe_customer_id` column to `photographers` table in follow-up task (store on first checkout).

**Implementation:**

```typescript
// In checkout endpoint:
const customer = await findCustomerByPhotographerId(stripe, photographer.id);
if (!customer) {
  // Create new customer - metadata includes photographer_id
  customer = await createCustomer({
    stripe,
    photographerId: photographer.id,
    email: photographer.email,
    name: photographer.name,
  });
}
// Use customer.id for checkout session
```

### `[GAP]` Success/Cancel URLs

**Question:** What are the actual frontend URLs for success/cancel redirects?

**Current plan:**

- Success: `/credits/success?session_id={CHECKOUT_SESSION_ID}`
- Cancel: `/credits/packages`

**Action:** Confirm with team or proceed with these defaults (T-12 will implement these routes anyway).

### `[GAP]` Error Response Format

**Question:** Should we use `@sabaipics/auth/errors` or define new error format?

**Observation:** Other endpoints use `createAuthError()` from `@sabaipics/auth/errors`.

**Recommendation:** Use existing error format for consistency.

## Implementation Checklist

- [ ] Add `POST /checkout` to `apps/api/src/routes/credits.ts`
- [ ] Implement request validation (packageId required)
- [ ] Query `credit_packages` table with `active = true`
- [ ] Find/create Stripe customer using `findCustomerByPhotographerId()`
- [ ] Call `createCheckoutSession()` with proper metadata
- [ ] Return `{ checkoutUrl, sessionId }` response
- [ ] Add unit tests
- [ ] Manual testing with Stripe test mode
