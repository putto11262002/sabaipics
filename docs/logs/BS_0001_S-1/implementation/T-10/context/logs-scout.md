# Logs Scout Report: T-10 Stripe Webhook Handler

**Task:** T-10 - Stripe webhook handler for `checkout.session.completed`
**Root:** BS_0001_S-1
**Date:** 2026-01-10
**Scout Source:** Prior implementation summaries in `docs/logs/BS_0001_S-1/implementation/*/summary/`

---

## Established Patterns

### 1. Webhook Handler Architecture (from T-4 Clerk Webhook, T-9 Stripe Setup)

**Location:** `apps/api/src/routes/webhooks/stripe.ts`

The Stripe webhook route already exists and uses an **event bus producer pattern**:

```typescript
// Webhook verifies signature and emits to event bus
const stripeProducer = eventBus.producer<StripeEvents>();

case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session;
  stripeProducer.emit("stripe:checkout.completed", {
    session,
    metadata: getSessionMetadata(session),
    customerId: extractCustomerId(session),
  });
  break;
}
```

**T-10 must implement the consumer** that handles `stripe:checkout.completed` events.

### 2. Event Bus Consumer Pattern (from `apps/api/src/events/`)

```typescript
import { eventBus } from "../../events";
import type { StripeEvents } from "../lib/stripe/events";

export function registerStripeHandlers() {
  return eventBus.handle<StripeEvents>({
    "stripe:checkout.completed": async (event) => {
      // Business logic here
    },
  });
}
```

### 3. Idempotency Pattern (from T-4 Clerk Webhook, T-9 Checkout)

**Critical:** T-9 summary states:
> "Webhook handler (T-10) will use `stripe_session_id` as idempotency key"

The `credit_ledger` table has:
- `stripe_session_id` column (nullable, unique via index)
- Index: `credit_ledger_stripe_session_idx` for fast lookup

**Idempotency check pattern (from T-4):**
```typescript
// Check if already processed
const [existing] = await db
  .select({ id: creditLedger.id })
  .from(creditLedger)
  .where(eq(creditLedger.stripeSessionId, session.id))
  .limit(1);

if (existing) {
  console.log("  -> Already fulfilled, skipping (idempotent)");
  return;
}
```

### 4. Error Handling in Webhooks (from T-4)

**Pattern:** Log errors but allow request to succeed to prevent Svix/Stripe retries on bad data:
```typescript
try {
  // Handler logic
} catch (handlerError) {
  console.error("[Stripe Handler] Error:", handlerError);
  // Don't rethrow - let webhook succeed
}
```

Note: The current `stripe.ts` route returns 400 for signature errors (correct for retries) but 200 for valid events.

### 5. Credit Ledger Schema (from T-1)

**File:** `packages/db/src/schema/credit-ledger.ts`

```typescript
export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  photographerId: uuid("photographer_id").notNull().references(...),
  amount: integer("amount").notNull(), // Positive for purchase
  type: text("type", { enum: creditLedgerTypes }).notNull(), // 'purchase' | 'upload'
  stripeSessionId: text("stripe_session_id"), // For idempotency
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: createdAtCol(),
});
```

### 6. Checkout Session Metadata (from T-9)

T-9 stores this metadata in checkout sessions:
```typescript
{
  photographer_id: string,  // UUID
  package_id: string,       // UUID
  package_name: string,     // For logging
  credits: string           // Number as string
}
```

Access via `getSessionMetadata(session)` helper in `apps/api/src/lib/stripe/`.

### 7. DB Injection for Webhooks (from T-4)

**Location:** `apps/api/src/index.ts`

```typescript
// DB injection for webhooks (registered before webhook router)
.use("/webhooks/*", (c, next) => {
  c.set("db", () => createDb(c.env.DATABASE_URL));
  return next();
})
.route("/webhooks", webhookRouter)
```

**Issue:** The event bus handlers fire asynchronously and may not have access to `c.var.db()`.
T-10 handler needs to create its own DB connection or receive it as a parameter.

---

## Known Limitations / Technical Debt

### From T-5 (PDPA Consent)
> `[KNOWN_LIMITATION]` No transaction wrapping insert + update (acceptable for MVP, both are idempotent-safe)

Same applies to T-10: single insert into `credit_ledger` is atomic and idempotent.

### From T-9 (Stripe Checkout)
> `[ENG_DEBT]` T-10: Implement webhook fulfillment handler for `checkout.session.completed`

This is the task at hand.

### From T-9 (Stripe Checkout) - Follow-ups
> `[PM_FOLLOWUP]` T-12: Implement success/cancel page UI

Frontend success page is separate work.

---

## Conventions

### Naming
- Handler file: `apps/api/src/handlers/stripe.ts` (suggested, to follow event bus pattern)
- Types in: `apps/api/src/lib/stripe/events.ts` (already exists)

### Logging
- Pattern: `[Module Name] Message` e.g., `[Stripe Handler] Processing checkout.session.completed`

### UUID vs Text
- All IDs use native Postgres `uuid` type (from T-1 iter-002)
- FK columns also use `uuid`

### Timestamp Convention
- Use `timestamptz()` helper from `packages/db/src/schema/common.ts`
- All timestamps are `mode: "string", withTimezone: true`

### Testing Pattern (from T-3, T-8)
- Use Hono's `testClient` for type-safe testing
- Mock DB with `@sabaipics/db` types

---

## Key Files for T-10 Implementation

| File | Purpose |
|------|---------|
| `apps/api/src/routes/webhooks/stripe.ts` | **Producer** - already emits `stripe:checkout.completed` |
| `apps/api/src/lib/stripe/events.ts` | Event type definitions (already has `StripeEvents`) |
| `apps/api/src/events/index.ts` | Event bus singleton |
| `packages/db/src/schema/credit-ledger.ts` | Credit ledger table schema |
| `apps/api/src/index.ts` | App wiring (may need handler registration) |

---

## T-10 Implementation Checklist (Derived from Patterns)

1. [ ] Create handler function that subscribes to `stripe:checkout.completed`
2. [ ] Extract `photographer_id`, `credits` from session metadata
3. [ ] Idempotency check: query `credit_ledger` by `stripe_session_id`
4. [ ] Calculate `expires_at` (1 year from now per business rules)
5. [ ] Insert into `credit_ledger` with type `'purchase'`
6. [ ] Register handler in app startup
7. [ ] Consider: Handler needs DB access - how to inject?

---

## Open Question

**DB access in event handlers:** The current webhook route fires events synchronously but handlers run in a "fire and forget" manner. The handler will need to:
- Either receive DB connection as part of event payload (non-standard)
- Or create its own DB connection using env vars

Recommendation: Create DB connection in handler using `DATABASE_URL` from environment (similar to how middleware does it).
