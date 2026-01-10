# Research: Stripe Credit Purchase Flow

**Root ID:** BS_0001_S-1
**Topic:** stripe-credit-flow
**Date:** 2026-01-09
**Status:** Complete
**Last Updated:** 2026-01-09 (enhanced with THB specifics and NEED_DECISION resolution)

---

## Executive Summary

**Decision Required**: What Stripe integration pattern should SabaiPics use for credit package purchases, and where should package definitions live?

**Recommendation**:
1. **Integration**: Use **Stripe Checkout Sessions (hosted)** via existing `createCheckoutSession()` - infrastructure already in place
2. **Credit Packages**: **Hardcode in API** initially (Option A), migrate to database when admin UI is built
3. **Fulfillment**: **Webhook-primary** with `checkout.session.completed` event; success redirect is display-only
4. **Thai Market**: Enable **PromptPay** in Stripe Dashboard for better local conversion

**Effort Estimate**: 2-4 hours (fulfillment logic + config file only)

**Key Findings**:
- Existing codebase has comprehensive Stripe integration ready to use
- THB is fully supported (minimum 10 THB, use satang for amounts)
- Webhook idempotency must be implemented (use `checkout_session_id` as key)
- `price_data` approach in existing code is recommended by Stripe for dynamic pricing

---

## 1. Decision Frame

### Question
What is the best Stripe integration pattern for credit package purchases in SabaiPics? Should we use Checkout Sessions, Payment Intents, or Payment Links? How should we handle credit fulfillment (webhook vs redirect)?

### Constraints (from US-4)
- Credits must be added immediately on successful payment
- Error handling with retry on card decline
- Receipt/confirmation required
- Idempotent webhook handling for reliability

### Architecture Context
- Hono API on Cloudflare Workers
- Existing Stripe integration at `apps/api/src/lib/stripe/`
- Webhook handling via signature verification already implemented
- Event bus pattern for decoupled event handling
- Target market: Thailand (THB currency, local payment methods)

---

## 2. Repo-First Grounding

### Existing Stripe Infrastructure

The codebase already has a comprehensive Stripe integration:

| File | Purpose | Status |
|------|---------|--------|
| `apps/api/src/lib/stripe/client.ts` | Client factory for CF Workers | Ready |
| `apps/api/src/lib/stripe/checkout.ts` | Flexible checkout session creation | Ready |
| `apps/api/src/lib/stripe/customer.ts` | Customer management with photographer linking | Ready |
| `apps/api/src/lib/stripe/webhook.ts` | Signature verification and event routing | Ready |
| `apps/api/src/lib/stripe/events.ts` | Typed event definitions | Ready |
| `apps/api/src/lib/stripe/errors.ts` | Error classification, backoff, formatting | Ready |
| `apps/api/src/routes/webhooks/stripe.ts` | Webhook endpoint (event bus producer) | Ready |
| `apps/api/src/handlers/stripe.ts` | Event handlers (shell implementations) | TODO: Add fulfillment logic |

### Key Implementation Details

**Checkout Session Creation** (`checkout.ts`):
- Uses `price_data` for dynamic pricing (no need to create Stripe Price objects upfront)
- Already supports THB currency
- Metadata support for `photographer_id`, `credits`, `package_name`
- Comment in code shows intended usage for credit packages

**Webhook Handler** (`handlers/stripe.ts`):
```typescript
// TODO: When database is ready:
// 1. Create payment record
// 2. Add credits to photographer's ledger
// 3. Update photographer's stripe_customer_id if not set
```

**Event Bus Pattern**:
- `stripe:checkout.completed` event already defined
- Carries `session`, `metadata`, `customerId`

### Data Schema (from `docs/deprecated/tech/01_data_schema.md`)

Credit system already designed:

**`credit_ledger` table** (immutable ledger):
- `type`: 'purchase', 'bonus', 'promo', 'usage', 'refund', 'expired'
- `amount`: Credits (positive = add, negative = deduct)
- `source`: 'stripe', 'signup', 'referral', 'admin', 'system'
- `source_reference`: Stripe payment intent ID
- `balance_after`: Denormalized running balance
- `expires_at`: For credit expiration (6 months for purchases)

**`payments` table**:
- `stripe_payment_intent_id`, `stripe_checkout_session_id`
- `amount_cents`, `currency`
- `credits_purchased`, `package_name`
- `status`: pending, succeeded, failed, refunded

---

## 3. Gap Analysis

### Must-Know (Blocking)
1. **Integration pattern choice**: Checkout Sessions vs Payment Intents vs Payment Links
2. **Fulfillment strategy**: Webhook-only vs redirect verification
3. **Idempotency**: How to prevent duplicate credit additions
4. **Credit package definition**: Where to store package configurations

### Nice-to-Know (Non-blocking)
1. Thai payment methods support (PromptPay)
2. Embedded vs hosted checkout comparison
3. Failure recovery patterns
4. Receipt/invoice generation

---

## 4. Evidence Summary

### Stripe Checkout Sessions (Tier A - Official Docs)

**What it is**: Low-code payment form hosted by Stripe or embedded in your site.

**Key Features**:
- Supports 40+ payment methods (cards, Apple Pay, Google Pay, PromptPay)
- Built-in PCI compliance, SCA-ready, responsive mobile design
- Handles card validation, error messaging, CAPTCHA
- Supports one-time payments and subscriptions
- Automatic currency conversion
- Recovery for abandoned carts

**How it works**:
1. Create Checkout Session with line items via API
2. Redirect customer to Stripe-hosted page OR embed in your site
3. Customer completes payment
4. Stripe sends `checkout.session.completed` webhook
5. Your server fulfills the order

**Fulfillment (from Stripe docs)**:
> "After the transaction, a webhook fulfills the order using the checkout."
> "To trigger fulfillment, create a webhook event handler to listen for payment events."

### Payment Intents (Tier A - Official Docs)

**What it is**: Lower-level API for custom payment flows.

**When to use**:
- Need full control over UI/UX
- Building custom checkout experience
- Complex payment scenarios (split payments, staged capture)

**Comparison with Checkout Sessions**:
| Aspect | Checkout Sessions | Payment Intents |
|--------|-------------------|-----------------|
| UI | Stripe-hosted or embedded | Build your own |
| Payment methods | Automatic support for 40+ | Manual integration per method |
| PCI compliance | Handled by Stripe | You manage elements |
| Development time | Hours | Days/weeks |
| Maintenance | Stripe updates automatically | You maintain |

### Payment Links (Tier A - Official Docs)

**What it is**: No-code payment pages shareable via URL.

**When to use**:
- No development resources
- Quick product launches
- Social media/email sales

**Limitations**:
- Limited customization
- Cannot pass custom metadata programmatically
- Better for static products, not dynamic per-user packages

### Webhook Best Practices (Tier B - Stripe Docs + Community)

**Idempotency for Webhooks**:
1. Store processed event IDs in database
2. Check if `event.id` exists before processing
3. Save it after successful handling

**From Stripe docs**:
> "Webhook endpoints might occasionally receive the same event more than once. Guard against duplicates by logging event IDs and skipping already-processed events."

**Retry Behavior**:
- Live mode: Retries for 3 days with decreasing frequency
- Test mode: 3 retries within a few hours
- Returns 2xx to acknowledge receipt

**Order of Events**:
> "Stripe does not guarantee events are delivered in order. Ensure your handler doesn't depend on receiving events in a specific order."

### Thai Payment Methods (Tier B - Stripe Thailand)

**THB Currency Support**:
- THB is a supported settlement currency with **minimum charge of 10 THB** (~$0.30 USD)
- THB is NOT a zero-decimal currency (use satang: 1 THB = 100 satang)
- Existing `checkout.ts` already defaults to `currency: 'thb'`

**PromptPay**:
- Thailand government-led instant payment method
- Customers scan QR code to pay via banking app
- Supported by Stripe Checkout
- Real-time payment confirmation
- **Lower fees** than credit cards in Thailand

**Supported Methods in Thailand** (via Stripe):
- Credit/debit cards (Visa, Mastercard, AMEX, JCB)
- PromptPay (QR code)
- Mobile banking (via bank redirects)
- Digital wallets (Apple Pay, Google Pay)

**Thai Market Considerations**:
- PromptPay is **highly popular** for local payments (zero fees for consumers)
- Credit card penetration is lower than Western markets
- Mobile banking apps are ubiquitous
- Consider enabling PromptPay for launch to maximize conversion

**Note**: Checkout Sessions automatically handle PromptPay if enabled in Stripe Dashboard. No code changes needed.

### Webhook Reliability (Tier C - Stripe Docs)

**Automatic Retry Behavior**:
- Live mode: Retries for **up to 3 days** with exponential backoff
- Test mode: 3 retries within a few hours
- Events are delivered at least once (may receive duplicates)

**Idempotency Requirements** (from Stripe docs):
> "Webhook endpoints might occasionally receive the same event more than once. Guard against duplicated event receipts by logging the event IDs you've processed, and then not processing already-logged events."
> "In some cases, two separate Event objects are generated and sent. To identify these duplicates, use the ID of the object in `data.object` along with the `event.type`."

**Event Ordering**:
> "Stripe doesn't guarantee the delivery of events in the order that they're generated."

This means our fulfillment handler must:
1. Be idempotent (check for existing payment record by `checkout_session_id`)
2. Not depend on event order (e.g., don't assume `payment_intent.succeeded` comes after `checkout.session.completed`)
3. Return 2xx quickly, process asynchronously if needed

**Existing Implementation Review**:
Our `apps/api/src/routes/webhooks/stripe.ts` already:
- Verifies signature via `verifyWebhookSignature()`
- Uses Web Crypto API (CF Workers compatible)
- Routes to event bus handlers
- Returns `{ received: true }` on success

**Gap**: Event handlers in `handlers/stripe.ts` do NOT yet implement idempotency (marked as TODO).

---

## 5. Option Synthesis

### Option A: Checkout Sessions (Stripe-Hosted) - RECOMMENDED

**Description**: Use existing `createCheckoutSession()` function. Redirect photographers to Stripe-hosted payment page. Fulfill credits via webhook.

**Flow**:
```
1. Photographer selects credit package in dashboard
2. API creates Checkout Session with metadata (photographer_id, credits, package_name)
3. Redirect to Stripe-hosted page
4. Photographer completes payment
5. Stripe sends checkout.session.completed webhook
6. Handler creates payment record + adds credits to ledger
7. Redirect to success page (show confirmation)
```

**Pros**:
- Already implemented in codebase (`checkout.ts`)
- PCI compliance handled by Stripe
- Supports Thai payment methods (PromptPay) automatically
- Minimal frontend work
- Automatic payment method support updates
- Built-in error handling and retries

**Cons**:
- Redirect away from app (UX friction)
- Less branding control (can customize colors/logo)
- Depends on webhook reliability

**Prerequisites**:
- Configure webhook endpoint in Stripe Dashboard
- Enable desired payment methods in Dashboard
- Implement fulfillment handler

**Risks & Mitigations**:

| Risk | Severity | Mitigation |
|------|----------|------------|
| Webhook delay/failure | Medium | Stripe retries for 3 days; idempotent handler prevents duplicates |
| User confusion on redirect | Low | Clear "Redirecting to secure payment..." message; branded Checkout |
| Double credit grant | High | Use `checkout_session_id` as idempotency key in DB |
| PromptPay async completion | Low | Handle `checkout.session.async_payment_succeeded` event |

**Red Flags** (stop if these apply):
- Need real-time credit grant before redirect returns: Use embedded checkout or Payment Intents
- Cannot tolerate any payment UI outside app: Use Payment Intents with custom form

**Effort**: Low (2-4 hours) - Infrastructure exists

---

### Option B: Checkout Sessions (Embedded)

**Description**: Same as Option A, but embed Stripe Checkout in the dashboard instead of redirecting.

**Flow**: Same as Option A, but payment form appears inline.

**Pros**:
- All pros of Option A
- Better UX (no redirect)
- Stays within app context

**Cons**:
- More frontend work (React component integration)
- Still uses webhook for fulfillment
- Slightly more complex error handling

**Prerequisites**:
- All from Option A
- React component for embedded checkout
- Handle return from checkout in-app

**Risks**:
- Same webhook risks as Option A
- Additional frontend complexity

**Effort**: Medium (1-2 days)

---

### Option C: Payment Intents (Custom UI)

**Description**: Build custom payment form using Stripe Elements. Full control over UX.

**Flow**:
```
1. Create PaymentIntent on server
2. Pass client_secret to frontend
3. Render Stripe Elements (card input)
4. Confirm payment on frontend
5. Handle result (success/error)
6. Webhook for async confirmation
```

**Pros**:
- Full UX control
- No redirect
- Can show inline errors

**Cons**:
- Significant development effort
- Must handle each payment method separately
- PCI compliance considerations
- More maintenance burden
- No existing implementation

**Prerequisites**:
- Stripe Elements integration
- Frontend card form component
- Payment method configuration
- Error handling for each payment method

**Risks**:
- Development time significantly higher
- More surface area for bugs
- Thai payment methods need separate integration

**Effort**: High (1-2 weeks)

---

### Option D: Payment Links (No-Code)

**Description**: Create payment links in Stripe Dashboard, share URLs to photographers.

**Pros**:
- Zero development for payment flow
- Quick to set up

**Cons**:
- Cannot pass dynamic metadata (photographer_id)
- Cannot create programmatically per user
- Limited customization
- Not suitable for authenticated user flow

**Verdict**: **Not suitable** for this use case. Cannot link payment to specific photographer.

---

### Sub-Decision: Credit Package Definition (NEED_DECISION Resolution)

**Original Plan Uncertainty**: `[NEED_DECISION]` Credit packages: A) Hardcode in API / B) Store in DB / C) Stripe Products/Prices

#### Option A: Hardcode in API

**Description**: Define packages as a TypeScript constant in API code.

| Pros | Cons |
|------|------|
| Simple, fast, no DB calls | Requires deploy to change prices |
| Type-safe at compile time | Cannot A/B test pricing |
| No external dependencies | No audit trail of price changes |
| Instant reads (no latency) | Marketing cannot self-serve updates |

**Best for**: MVP/early launch where pricing is stable.

#### Option B: Store in Database

**Description**: Create `credit_packages` table, fetch at runtime with caching.

| Pros | Cons |
|------|------|
| Dynamic updates without deploy | Extra complexity (cache, admin UI) |
| Admin can modify prices | DB call latency (mitigated by cache) |
| A/B testing possible | Need to build admin interface |
| Audit trail of changes | One more table to maintain |

**Best for**: Products needing frequent price changes or marketing control.

#### Option C: Stripe Products/Prices

**Description**: Create Product and Price objects in Stripe Dashboard, fetch via API.

| Pros | Cons |
|------|------|
| Single source of truth | API call required to list packages |
| Stripe Dashboard editing | Tightly coupled to Stripe |
| Price objects visible in Stripe reports | Cannot store custom fields (like "credits granted") |
| Automatic currency handling | Metadata limited to 50 keys |

**Stripe Docs Finding**: *"If you need to charge an amount different for each transaction... you can use the `price_data` parameter when creating Checkout Sessions."* This confirms our existing `checkout.ts` approach using `price_data` is valid.

**Important**: Even with Stripe Products/Prices, you still need to track "credits per package" somewhere (Stripe doesn't have this concept natively).

#### Recommendation Matrix

| Scenario | Recommended Option |
|----------|-------------------|
| MVP launch, <3 packages | **A (Hardcode)** |
| Multiple regions/currencies | **B (Database)** + caching |
| Non-technical admin needs control | **B (Database)** + admin UI |
| Subscription-like billing later | **C (Stripe)** for consistency |

**Recommendation for SabaiPics**: **Option A (Hardcode) initially**, migrate to Option B when admin dashboard is built. Option C adds unnecessary coupling since we use `price_data` anyway.

```typescript
// apps/api/src/config/credit-packages.ts
export const CREDIT_PACKAGES = [
  { id: 'starter', name: 'Starter', credits: 100, priceCents: 29900, currency: 'thb' },
  { id: 'growth', name: 'Growth', credits: 500, priceCents: 99900, currency: 'thb' },
  { id: 'professional', name: 'Professional', credits: 1500, priceCents: 249900, currency: 'thb' },
  { id: 'studio', name: 'Studio', credits: 5000, priceCents: 699900, currency: 'thb' },
] as const;
```

---

### Sub-Decision: Fulfillment Strategy

**Webhook-only vs Webhook + Redirect Verification**

| Strategy | Description | Reliability |
|----------|-------------|-------------|
| **Webhook-only** | Trust webhook for fulfillment, success page is display-only | High (Stripe guarantees delivery) |
| **Redirect + Webhook** | Verify on redirect, webhook as backup | Higher (double-check) |
| **Redirect-only** | No webhook, fulfill on success redirect | LOW (user can close tab) |

**Recommendation**: **Webhook-primary with redirect display**

1. **Webhook** (`checkout.session.completed`): Primary fulfillment mechanism
   - Create payment record
   - Add credits to ledger
   - Use event.id for idempotency

2. **Success redirect**: Display-only confirmation
   - Retrieve session via `session_id` query param
   - Show payment details and new balance
   - Do NOT fulfill here (already done by webhook)

**Idempotency Implementation**:
```typescript
// In webhook handler
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const eventId = session.id; // or event.id from webhook

  // Check if already processed
  const existing = await db.query.payments.findFirst({
    where: eq(payments.stripe_checkout_session_id, session.id)
  });

  if (existing) {
    console.log(`[Stripe] Session ${session.id} already processed, skipping`);
    return;
  }

  // Process payment + add credits (in transaction)
  await db.transaction(async (tx) => {
    // Insert payment record
    // Insert credit ledger entry
  });
}
```

---

## 6. Open Questions

### For Human Decision

1. **Package pricing**: Are the example prices (299, 999, 2499, 6999 THB) correct for launch?
2. **Credit expiration**: Confirm 6-month expiration policy for purchased credits.
3. **PromptPay**: Should we enable PromptPay for launch? (adds bank transfer option)
4. **Receipt delivery**: Email receipt vs LINE notification vs both?

### Technical (Can Research Further if Needed)

1. **Refund flow**: How to handle refunds and credit reversal?
2. **Failed payment retry**: Should we notify photographer to retry via email/LINE?
3. **Promo codes**: Enable Stripe promo codes for launch?

---

## 7. Recommendation

### Primary Recommendation: Option A (Checkout Sessions, Stripe-Hosted)

**Rationale**:
1. **Existing infrastructure**: `createCheckoutSession()` already implemented and tested
2. **Lowest effort**: 2-4 hours to complete fulfillment logic
3. **Maximum reliability**: Stripe handles payment complexity, Thai payment methods
4. **Proven pattern**: Industry standard for credit/token purchases
5. **Security**: PCI compliance handled by Stripe

**Implementation Path**:
1. Define credit packages in config file
2. Create API endpoint: `POST /credits/purchase` (creates checkout session)
3. Implement fulfillment in `handlers/stripe.ts` (payment + ledger insert)
4. Add idempotency check (by session_id)
5. Create success page component (display-only)
6. Enable PromptPay in Stripe Dashboard (optional)

### Future Enhancement: Option B (Embedded Checkout)

After launch, if UX feedback indicates redirect friction, migrate to embedded checkout. The backend/fulfillment logic remains identical.

---

## 8. References

### Codebase Files
- `/apps/api/src/lib/stripe/` - Existing Stripe integration
- `/apps/api/src/handlers/stripe.ts` - Event handlers (add fulfillment here)
- `/docs/deprecated/tech/01_data_schema.md` - Credit ledger schema
- `/log/002-stripe-integration.md` - Implementation changelog

### Stripe Documentation
- [Checkout Sessions Overview](https://stripe.com/docs/payments/checkout)
- [How Checkout Works](https://docs.stripe.com/payments/checkout/how-checkout-works)
- [Fulfill Orders](https://docs.stripe.com/checkout/fulfillment)
- [Webhooks](https://docs.stripe.com/webhooks)
- [PromptPay Payments](https://docs.stripe.com/payments/promptpay)
- [Thailand Payment Methods](https://stripe.com/resources/more/payment-methods-thailand)

### Prior Research
- `/docs/deprecated/research/clerk_billing_credits.md` - Confirmed Clerk Billing unsuitable for credit system
