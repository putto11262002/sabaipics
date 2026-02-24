# Stripe Integration Setup

Topic: Payment infrastructure setup for credit purchases

---

## 2025-12-15: Initial Implementation

### Added

- `apps/api/src/lib/stripe/` - Stripe SDK utilities
  - `client.ts` - Client factory for CF Workers with FetchHttpClient
  - `errors.ts` - Error classification, backoff calculation, formatting
  - `checkout.ts` - Flexible checkout session creation (no hardcoded packages)
  - `customer.ts` - Customer management with photographer linking
  - `webhook.ts` - Signature verification and event routing
  - `index.ts` - Clean re-exports

- `apps/api/src/routes/webhooks/stripe.ts` - Webhook endpoint with shell handlers
  - POST `/webhooks/stripe` - Receives Stripe webhook events
  - Handles: checkout.session.completed/expired, payment_intent.succeeded/failed, customer.created/updated/deleted
  - Shell handlers log events; business logic deferred to later

- `apps/api/tests/fixtures/stripe-events.ts` - Mock event fixtures
- `apps/api/tests/stripe.test.ts` - Unit tests (41 tests)
  - Error classification
  - Backoff calculation
  - Error formatting
  - Webhook event routing
  - Signature verification
- `apps/api/tests/stripe.integration.ts` - Integration tests (real API calls, local only)
  - Customer API tests (5 tests)
  - Checkout session tests (4 tests)

- `apps/api/.dev.vars.example` - Template with all env vars

### Modified

- `apps/api/src/routes/webhooks/index.ts` - Added Stripe router
- `apps/api/tests/setup.integration.ts` - Added STRIPE_SECRET_KEY validation
- `.github/workflows/deploy-staging.yml` - Added Stripe secrets, removed integration tests from CI
- `.github/workflows/deploy-production.yml` - Added Stripe secrets, removed integration tests from CI

### Technical Decisions

- **API Version**: `2025-11-17.clover` (Stripe SDK v20)
- **CF Workers**: Uses `Stripe.createFetchHttpClient()` and `Stripe.createSubtleCryptoProvider()`
- **Webhook verification**: `constructEventAsync()` with raw body
- **Pricing flexibility**: Uses `price_data` for dynamic pricing (no hardcoded packages)
- **Currency**: THB (amounts in satang, 100 = 1 THB, minimum 1000 = 10 THB)
- **Retry config**: `maxNetworkRetries: 2`, 20s timeout
- **Testing**: Integration tests run locally only (not in CI/CD)

### Environment Setup

#### Recommended: Use Stripe Sandboxes (not just Test Mode)

- Create separate sandboxes for Development and Staging
- Each sandbox has isolated data and its own API keys
- Production uses Live Mode

| Environment | Stripe Mode         | Webhook URL                                         |
| ----------- | ------------------- | --------------------------------------------------- |
| Local       | Development Sandbox | `https://<ngrok-domain>/webhooks/stripe`            |
| Staging     | Staging Sandbox     | `https://api-staging.sabaipics.com/webhooks/stripe` |
| Production  | Live Mode           | `https://api.sabaipics.com/webhooks/stripe`         |

#### Environment Variables Required

```bash
STRIPE_SECRET_KEY=sk_test_xxx    # or sk_live_xxx for production
STRIPE_WEBHOOK_SECRET=whsec_xxx  # unique per webhook endpoint
```

#### GitHub Secrets (per environment)

- `stage`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `production`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### Local Testing

#### With ngrok (recommended)

```bash
# Start ngrok tunnel
ngrok http 8787 --domain=<your-ngrok-domain>

# Create webhook in Stripe Dashboard pointing to ngrok URL
# Copy the signing secret to .dev.vars
```

#### With Stripe CLI

```bash
stripe listen --forward-to localhost:8787/webhooks/stripe
stripe trigger checkout.session.completed
```

### Test Commands

```bash
pnpm test              # Unit tests (52 tests)
pnpm test:integration  # Integration tests - local only (12 tests)
```

---

## 2025-12-15: Event Bus Pattern Implementation

### Added

- `apps/api/src/events/` - Generic, type-safe event bus system
  - `event-bus.ts` - Core EventBus class with producer/consumer pattern
  - `index.ts` - Singleton instance and re-exports

- `apps/api/src/lib/stripe/events.ts` - Stripe event type definitions
  - Discriminated union type for all Stripe webhook events
  - Events: `stripe:checkout.completed`, `stripe:checkout.expired`, `stripe:payment.succeeded`, `stripe:payment.failed`, `stripe:customer.created/updated/deleted`

- `apps/api/src/handlers/stripe.ts` - Stripe event handlers
  - Registered via `registerStripeHandlers()` at startup
  - Shell handlers (logging only) - business logic deferred

### Modified

- `apps/api/src/routes/webhooks/stripe.ts` - Now emits events to bus instead of inline handling
  - Uses `eventBus.producer<StripeEvents>()` for type-safe emission
- `apps/api/src/index.ts` - Registers event handlers at startup
- `apps/api/src/lib/stripe/index.ts` - Exports `StripeEvents` type

### Technical Design

#### Event Bus Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                     Global EventBus                             │
│         (Generic - knows nothing about event shapes)            │
└─────────────────────────────────────────────────────────────────┘
                   ▲                         │
                   │ publish                 │ deliver
                   │                         ▼
┌──────────────────┴───────┐    ┌───────────────────────────────┐
│       Producers          │    │         Consumers             │
│  (Define & emit events)  │    │  (Subscribe & handle events)  │
└──────────────────────────┘    └───────────────────────────────┘
```

#### Event Definition (Discriminated Union)

```typescript
export type StripeEvents =
  | { type: "stripe:checkout.completed"; session: Session; ... }
  | { type: "stripe:payment.failed"; paymentIntent: PaymentIntent; ... };
```

#### Producer Usage

```typescript
const producer = eventBus.producer<StripeEvents>();
producer.emit('stripe:checkout.completed', { session, metadata, customerId });
```

#### Consumer Registration

```typescript
eventBus.handle<StripeEvents>({
  'stripe:checkout.completed': async (event) => {
    // Handle event with full type inference
  },
});
```

### Key Features

- **Type-safe**: Full TypeScript inference from event definition to handler
- **Decoupled**: Webhook route only emits events; business logic in handlers
- **Extensible**: Add new event types by defining new discriminated unions
- **Multiple consumers**: Same event can trigger logging, analytics, and business logic
- **Fire-and-forget async**: Handlers run concurrently; errors logged but don't block others
