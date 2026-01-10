# Tech Docs Context

Task: T-10 (Stripe webhook handler)
Root: BS_0001_S-1
Date: 2026-01-10
Scout: Tech Docs Scout

---

## Must-Follow Conventions

### 1. API Conventions

**Framework/Runtime:**
- Hono ^4.10.7 on Cloudflare Workers
- Validation: Zod ^4.1.13
- TypeScript 5.9.2

**Webhook Route Pattern (from existing implementation):**
- File: `apps/api/src/routes/webhooks/stripe.ts`
- Router mounting: At `/webhooks/stripe` with no auth middleware
- DB injection via middleware: `c.set("db", () => createDb(c.env.DATABASE_URL))`
- No CORS for webhook routes (verified by signature instead)

**Error Response Pattern:**
```typescript
// 400 for invalid signature/missing header
return c.json({ error: "Missing signature" }, 400);
return c.json({ error: "Invalid signature" }, 400);

// 500 for config errors
return c.json({ error: "Stripe not configured" }, 500);
return c.json({ error: "Webhook secret not configured" }, 500);

// Success response
return c.json({ received: true });
```

**Environment Bindings:**
```typescript
type StripeWebhookBindings = {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
};
```

---

### 2. Stripe Integration Patterns

**Client Creation:**
- File: `apps/api/src/lib/stripe/client.ts`
- Use `createStripeClient(c.env)` - factory pattern
- CF Workers compatible: Uses `Stripe.createFetchHttpClient()` and `Stripe.createSubtleCryptoProvider()`
- Config: `maxNetworkRetries: 2`, `timeout: 20000`

**Webhook Signature Verification:**
- File: `apps/api/src/lib/stripe/webhook.ts`
- CRITICAL: Must use raw body (`await c.req.text()`), NOT `c.req.json()`
- Use `verifyWebhookSignature(stripe, rawBody, signature, webhookSecret)`
- Returns `Stripe.Event` on success, throws on invalid signature

```typescript
// Correct pattern
const rawBody = await c.req.text();
const event = await verifyWebhookSignature(
  stripe,
  rawBody,
  signature,
  c.env.STRIPE_WEBHOOK_SECRET
);
```

**Event Bus Pattern:**
- File: `apps/api/src/events/event-bus.ts`
- Producer/consumer pattern for decoupled event handling
- Event definitions: `apps/api/src/lib/stripe/events.ts`
- Handlers registered at startup: `apps/api/src/handlers/stripe.ts`

**Event Types (Discriminated Union):**
```typescript
type StripeEvents =
  | { type: "stripe:checkout.completed"; session: Session; metadata: Record<string, string>; customerId: string | null }
  | { type: "stripe:checkout.expired"; session: Session; metadata: Record<string, string> }
  | { type: "stripe:payment.succeeded"; paymentIntent: PaymentIntent; customerId: string | null }
  | { type: "stripe:payment.failed"; paymentIntent: PaymentIntent; errorCode: string | null; errorMessage: string | null; declineCode: string | null }
  | { type: "stripe:customer.created"; customer: Customer }
  | { type: "stripe:customer.updated"; customer: Customer }
  | { type: "stripe:customer.deleted"; customerId: string };
```

---

### 3. Security Requirements for Webhooks

**Signature Verification:**
- Always verify Stripe signature before processing
- Use `stripe-signature` header
- Return 400 for invalid signatures (Stripe will retry)

**Environment Validation:**
- Check `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` exist before processing
- Return 500 if not configured (deployment error, not user error)

**Idempotency (REQUIRED):**
- Stripe may send duplicate events (documented behavior)
- Use `stripe_session_id` (checkout.session.id) as idempotency key
- Check if session already processed before adding credits

```typescript
// Idempotency pattern (from research doc)
const existing = await db.query.creditLedger.findFirst({
  where: eq(creditLedger.stripeSessionId, session.id)
});

if (existing) {
  console.log(`[Stripe] Session ${session.id} already processed, skipping`);
  return; // No error - successful idempotent handling
}
```

**Quick Response:**
- Return 200 quickly to Stripe
- Business logic can be async (event bus pattern handles this)
- Stripe retries for 3 days if non-2xx returned

---

### 4. Database Conventions

**Schema Files:**
- Credit ledger: `packages/db/src/schema/credit-ledger.ts`
- Photographers: `packages/db/src/schema/photographers.ts`

**Credit Ledger Table:**
```typescript
export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  photographerId: uuid("photographer_id").notNull().references(() => photographers.id),
  amount: integer("amount").notNull(), // Positive for purchase, negative for deduction
  type: text("type", { enum: ["purchase", "upload"] }).notNull(),
  stripeSessionId: text("stripe_session_id"), // Nullable, only for purchases
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: createdAtCol(),
});
```

**Key Fields:**
- `stripeSessionId` - idempotency key for webhook (UNIQUE per purchase)
- `expiresAt` - 6 months from purchase for FIFO expiry
- `type` - "purchase" for webhook-created entries

**Photographers Table:**
```typescript
export const photographers = pgTable("photographers", {
  id: uuid("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  pdpaConsentAt: timestamptz("pdpa_consent_at"),
  createdAt: createdAtCol(),
});
```

**Key Field:**
- `stripeCustomerId` - links photographer to Stripe customer

---

### 5. Testing Conventions

**Test Framework:**
- Vitest ^3.2.0
- Cloudflare Vitest pool: `@cloudflare/vitest-pool-workers ^0.10.14`

**Test Files Location:**
- Unit tests: `apps/api/tests/stripe.test.ts`
- Integration tests: `apps/api/tests/stripe.integration.ts` (local only)
- Fixtures: `apps/api/tests/fixtures/stripe-events.ts`

**Mock Fixtures Pattern:**
```typescript
import {
  createCheckoutCompletedEvent,
  MOCK_IDS,
  TEST_WEBHOOK_SECRET,
  createRawEventPayload,
} from "./fixtures/stripe-events";

// MOCK_IDS provides consistent test IDs
const session = event.data.object as Stripe.Checkout.Session;
expect(session.metadata?.photographer_id).toBe(MOCK_IDS.photographer);
```

**Test Commands:**
```bash
pnpm test              # Unit tests
pnpm test:integration  # Integration tests (local only)
```

---

### 6. Key Metadata Contract (from T-9)

Checkout session metadata passed from T-9:
```typescript
metadata: {
  photographer_id: string,  // UUID - lookup photographer
  package_id: string,       // UUID - for analytics
  package_name: string,     // For Stripe Dashboard
  credits: string           // Integer as string - amount to add
}
```

**Credit Expiry:**
- 6 months from purchase date
- Use `NOW + interval '6 months'` in SQL or add 180 days in JS

---

### 7. Error Handling Utilities

**File:** `apps/api/src/lib/stripe/errors.ts`

**Error Classification:**
- `isRetryableError(error)` - rate limit, connection, API errors
- `isCardError(error)` - card declined (not retryable)
- `isAuthenticationError(error)` - bad API key (not retryable)

**Error Formatting:**
```typescript
const formatted = formatStripeError(error);
// Returns: { code, message, type, retryable, declineCode?, param? }
```

---

## File References

### Existing Implementation (Must Reference)

| File | Purpose | Notes |
|------|---------|-------|
| `apps/api/src/routes/webhooks/stripe.ts` | Webhook route | Producer - emits events |
| `apps/api/src/handlers/stripe.ts` | Event handlers | Consumer - **ADD FULFILLMENT HERE** |
| `apps/api/src/lib/stripe/webhook.ts` | Signature verification | verifyWebhookSignature, getSessionMetadata |
| `apps/api/src/lib/stripe/events.ts` | Event type definitions | StripeEvents union |
| `apps/api/src/events/event-bus.ts` | Event bus core | Generic pub/sub |
| `packages/db/src/schema/credit-ledger.ts` | Credit ledger schema | Insert here |
| `packages/db/src/schema/photographers.ts` | Photographer schema | Update stripeCustomerId |

### Research Documents

| File | Key Findings |
|------|--------------|
| `docs/logs/BS_0001_S-1/research/stripe-credit-flow.md` | Idempotency via session_id, webhook-primary fulfillment |
| `log/002-stripe-integration.md` | API version, CF Workers config, event bus pattern |

### Task References

| Task | Relationship |
|------|-------------|
| T-9 | Upstream - creates checkout session with metadata |
| T-1 | Foundation - created credit_ledger schema |
| T-12 | Downstream - UI shows success/balance after webhook |

---

## Implementation Checklist (Must Follow)

1. **Handle `stripe:checkout.completed` event** in `apps/api/src/handlers/stripe.ts`
2. **Implement idempotency** using `stripeSessionId` check before insert
3. **Extract metadata** from event: `photographer_id`, `credits`
4. **Insert credit_ledger row** with:
   - `photographerId` from metadata
   - `amount` = credits (positive)
   - `type` = "purchase"
   - `stripeSessionId` = session.id
   - `expiresAt` = NOW + 6 months
5. **Optionally update photographer.stripeCustomerId** if not set
6. **Add unit tests** for handler with mock events
7. **Test idempotency** - same session twice should only add credits once

---

## THB Currency Note

- THB uses satang (100 satang = 1 THB)
- Minimum charge: 1000 satang (10 THB)
- Session amounts are in satang (e.g., 29900 = 299 THB)
