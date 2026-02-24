# Codebase Exemplars for T-10 (Stripe Webhook Handler)

Task: Implement `checkout.session.completed` handler to add credits to photographer's ledger with FIFO expiry.

Primary Surface: **API** (webhook handler with DB writes)

---

## Exemplar 1: Stripe Webhook Route (Producer Pattern)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/webhooks/stripe.ts`

**What the pattern is:**

- Webhook route that validates signature, parses events, and emits to an event bus
- Uses typed environment bindings for Stripe secrets
- Raw body parsing via `c.req.text()` (critical for signature verification)
- Event routing via switch statement with type casting

**Key code snippets:**

```typescript
// Environment typing
type StripeWebhookBindings = {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
};

// Signature verification
const rawBody = await c.req.text();
const event = await verifyWebhookSignature(
  stripe,
  rawBody,
  signature,
  c.env.STRIPE_WEBHOOK_SECRET
);

// Event routing to event bus
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

**Why it matters:**

- T-10 extends the existing `stripe:checkout.completed` handler (currently logging only)
- The webhook infrastructure is already built - just need to add business logic to the handler

---

## Exemplar 2: Stripe Event Handler (Consumer Pattern)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/handlers/stripe.ts`

**What the pattern is:**

- Event bus consumer that handles Stripe events with business logic
- Uses `eventBus.handle<StripeEvents>()` for type-safe event handling
- Async handlers with structured logging
- Currently "shell" implementations with TODO comments for DB logic

**Key code snippets:**

```typescript
// Handler registration
export function registerStripeHandlers(): () => void {
  return eventBus.handle<StripeEvents>({
    'stripe:checkout.completed': async (event) => {
      console.log('Session ID:', event.session.id);
      console.log('Metadata:', JSON.stringify(event.metadata, null, 2));

      // TODO: When database is ready:
      // 1. Create payment record
      // 2. Add credits to photographer's ledger
      // 3. Update photographer's stripe_customer_id if not set
      //
      // const photographerId = event.metadata.photographer_id;
      // const credits = parseInt(event.metadata.credits ?? '0', 10);
      // await db.insert(payments).values({...});
      // await db.insert(credit_ledger).values({...});
    },
  });
}
```

**Why it matters:**

- T-10 replaces the TODO comments with actual DB logic
- The metadata extraction pattern (`photographer_id`, `credits`) is already shown
- Need to inject DB access into handlers (currently handlers don't have `db`)

---

## Exemplar 3: Consent API (DB Insert Pattern)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/consent.ts`

**What the pattern is:**

- Drizzle ORM insert + update in same handler
- Idempotency check before insert (return 409 if already exists)
- Uses `.returning()` to get inserted record

**Key code snippets:**

```typescript
// Insert record
const [consentRecord] = await db
  .insert(consentRecords)
  .values({
    photographerId: photographer.id,
    consentType: 'pdpa',
    ipAddress,
  })
  .returning({
    id: consentRecords.id,
    consentType: consentRecords.consentType,
    createdAt: consentRecords.createdAt,
  });

// Update related table
await db
  .update(photographers)
  .set({ pdpaConsentAt: now })
  .where(eq(photographers.id, photographer.id));
```

**Why it matters:**

- T-10 needs to insert into `credit_ledger` with similar pattern
- Idempotency check using `stripe_session_id` follows same pattern as consent check

---

## Credit Ledger Schema Reference

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/credit-ledger.ts`

```typescript
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: uuid('photographer_id')
      .notNull()
      .references(() => photographers.id, { onDelete: 'restrict' }),
    amount: integer('amount').notNull(), // Positive for purchase
    type: text('type', { enum: ['purchase', 'upload'] }).notNull(),
    stripeSessionId: text('stripe_session_id'), // Idempotency key
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAtCol(),
  },
  (table) => [index('credit_ledger_stripe_session_idx').on(table.stripeSessionId)],
);
```

**Key insights for T-10:**

- Use `stripeSessionId` as idempotency key (check before insert)
- `expiresAt` should be `NOW + 6 months` per task requirements
- `type` should be `"purchase"` for webhook-triggered credits
- `amount` is positive for purchases

---

## Test Patterns

### Unit Test Pattern (Webhook Handlers)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/tests/stripe.test.ts`

**Pattern:**

- Uses Vitest with `vi.fn()` for mocks
- Uses test fixtures from `fixtures/stripe-events.ts`
- Tests handler routing, success/error cases, and idempotency

```typescript
describe('Webhook Event Routing', () => {
  it('routes checkout.session.completed to onCheckoutComplete', async () => {
    const event = createCheckoutCompletedEvent();
    const result = await handleWebhookEvent(event, handlers);

    expect(result.success).toBe(true);
    expect(result.eventType).toBe('checkout.session.completed');
    expect(mockCheckoutComplete).toHaveBeenCalledOnce();
  });

  it('returns error result when handler throws', async () => {
    const event = createCheckoutCompletedEvent();
    const errorHandlers = {
      onCheckoutComplete: vi.fn().mockRejectedValue(new Error('Handler error')),
    };

    const result = await handleWebhookEvent(event, errorHandlers);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Handler error');
  });
});
```

### Unit Test Pattern (API Routes with DB)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/consent.test.ts`

**Pattern:**

- Mock DB with chainable methods
- Use `testClient(app)` for type-safe requests
- Test both success and idempotency (409) cases

```typescript
function createMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: MOCK_ID, ... }]),
  };
}

// Test idempotency
it("returns 409 when already processed", async () => {
  const { app } = createTestApp({
    // Simulate already-exists state
  });
  const res = await client.consent.$post();
  expect(res.status).toBe(409);
});
```

### Stripe Event Fixtures

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/tests/fixtures/stripe-events.ts`

**Pattern:**

- Factory functions for each event type
- `MOCK_IDS` object for consistent test data
- `createCheckoutCompletedEvent(overrides?)` accepts partial overrides

```typescript
export const MOCK_IDS = {
  customer: 'cus_test123456',
  session: 'cs_test_session_123',
  photographer: 'photo_test_123',
};

export function createCheckoutCompletedEvent(
  overrides?: Partial<Stripe.Checkout.Session>,
): Stripe.Event {
  const session = {
    id: MOCK_IDS.session,
    metadata: {
      photographer_id: MOCK_IDS.photographer,
      credits: '100',
      package_name: 'starter',
    },
    ...overrides,
  };
  // ...
}
```

---

## Error Response Pattern

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/consent.ts`

```typescript
// Error helper pattern
function alreadyProcessedError() {
  return {
    error: {
      code: 'ALREADY_PROCESSED',
      message: 'Credits already added for this session',
    },
  };
}

// Usage in handler
if (existingEntry) {
  return c.json(alreadyProcessedError(), 409);
}
```

---

## Implementation Checklist for T-10

Based on exemplars, T-10 should:

1. **Modify handler** in `apps/api/src/handlers/stripe.ts`:
   - Inject DB access (either pass through event bus or access via singleton)
   - Check `credit_ledger` for existing `stripe_session_id` (idempotency)
   - Insert new credit ledger entry with:
     - `photographerId` from `metadata.photographer_id`
     - `amount` from `parseInt(metadata.credits, 10)`
     - `type: "purchase"`
     - `stripeSessionId: session.id`
     - `expiresAt: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)` (6 months)

2. **Handle edge cases**:
   - Missing `photographer_id` in metadata (log error, don't crash)
   - Missing `credits` in metadata (log error, don't crash)
   - Photographer not found in DB (log error, still return 200 to Stripe)

3. **Tests** (follow patterns from `stripe.test.ts` and `consent.test.ts`):
   - Unit test credit insertion
   - Unit test idempotency (same session ID twice)
   - Unit test missing metadata handling

---

## Files to Modify

| File                              | Change                                              |
| --------------------------------- | --------------------------------------------------- |
| `apps/api/src/handlers/stripe.ts` | Add DB logic to `stripe:checkout.completed` handler |
| `apps/api/src/events/index.ts`    | May need to export DB access pattern                |
| `apps/api/tests/stripe.test.ts`   | Add tests for credit insertion                      |
