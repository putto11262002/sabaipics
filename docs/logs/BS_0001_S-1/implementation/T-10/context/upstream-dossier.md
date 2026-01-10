# Upstream Dossier: T-10 (Stripe webhook handler)

Root: `BS_0001_S-1`
Task: `T-10`
Generated: 2026-01-10

---

## Task Definition (from tasks.md)

### T-10 — Stripe webhook handler

- [ ] Done
- **Type:** `integration`
- **StoryRefs:** US-4
- **Refs:** `docs/logs/BS_0001_S-1/research/stripe-credit-flow.md`
- **Goal:** Handle `checkout.session.completed` webhook to add credits to photographer's ledger with FIFO expiry.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/webhooks/stripe.ts`, `apps/api/src/lib/stripe/handlers/`
- **Dependencies:** `T-1`, `T-9`
- **Acceptance:**
  - Verifies Stripe signature
  - Extracts package info from session metadata
  - Inserts credit_ledger row with `+amount`, `expires_at = NOW + 6 months`
  - Uses `stripe_session_id` as idempotency key (no duplicate credits)
  - Returns 200 on success
- **Tests:**
  - Unit test with mock webhook
  - Test idempotency (same session twice)
  - Test with missing metadata
- **Rollout/Risk:**
  - High risk (payments)
  - Monitor for webhook failures
  - Manual reconciliation process if needed

---

## Dependencies Status

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T-1 | DB Schema (all domain tables) | Done | `credit_ledger` table exists with `stripe_session_id` column |
| T-9 | Stripe checkout API | Done | PR #15 merged; creates checkout sessions with metadata |

**All dependencies complete.**

---

## Load-Bearing References

| Path | Purpose |
|------|---------|
| `docs/logs/BS_0001_S-1/plan/final.md` | Execution plan with credit ledger mechanics |
| `docs/logs/BS_0001_S-1/research/stripe-credit-flow.md` | Stripe integration decisions, idempotency patterns |
| `docs/logs/BS_0001_S-1/implementation/T-9/summary/iter-001.md` | T-9 implementation details, metadata contract |

---

## Implied Contracts

### Event Bus Contract

The webhook route (`apps/api/src/routes/webhooks/stripe.ts`) already emits `stripe:checkout.completed` events. The handler must consume from the event bus.

**Event payload (from `apps/api/src/lib/stripe/events.ts`):**
```typescript
{
  type: "stripe:checkout.completed";
  session: Stripe.Checkout.Session;
  metadata: Record<string, string>;
  customerId: string | null;
}
```

### Metadata Contract (from T-9)

T-9 passes this metadata to Stripe checkout sessions:
```typescript
{
  photographer_id: string,  // UUID of photographer
  package_id: string,       // UUID of credit package
  package_name: string,     // Human-readable name
  credits: string           // Number of credits to add (as string)
}
```

### Credit Ledger Schema (from `packages/db/src/schema/credit-ledger.ts`)

```typescript
{
  id: uuid,
  photographerId: uuid,           // FK to photographers
  amount: integer,                // Positive for purchase
  type: "purchase" | "upload",
  stripeSessionId: text | null,   // Idempotency key
  expiresAt: timestamptz,         // NOW + 6 months for purchases
  createdAt: timestamptz
}
```

**Indexes:**
- `credit_ledger_photographer_expires_idx` on (photographer_id, expires_at)
- `credit_ledger_stripe_session_idx` on (stripe_session_id)

### Fulfillment Logic (from plan/final.md)

**Credit expiry:** `expires_at = NOW() + 6 months`

**Idempotency:** Use `stripe_session_id` (unique constraint or existence check) to prevent duplicate credit grants.

---

## Existing Infrastructure

| Component | Path | Status |
|-----------|------|--------|
| Webhook route | `apps/api/src/routes/webhooks/stripe.ts` | Ready (emits events) |
| Event bus | `apps/api/src/events/` | Ready |
| Handler shell | `apps/api/src/handlers/stripe.ts` | Shell only (TODO comments) |
| Event types | `apps/api/src/lib/stripe/events.ts` | Ready |
| Credit ledger schema | `packages/db/src/schema/credit-ledger.ts` | Ready |

---

## Gaps and Uncertainties

### `[NEED_VALIDATION]` Database Access in Handler

The current handler (`apps/api/src/handlers/stripe.ts`) is synchronous and does not have DB access. Need to confirm:
- How to pass DB client to event handlers
- Whether to use Drizzle ORM or raw SQL

**Likely approach:** Import DB client directly in handler, or pass via closure.

### `[NEED_VALIDATION]` Transaction Scope

Should the idempotency check + insert be in a transaction to prevent race conditions?

**Research finding (from stripe-credit-flow.md):** Use `stripe_session_id` as idempotency key with unique constraint or existence check before insert.

### `[GAP]` Error Handling Strategy

What should happen if:
1. `photographer_id` in metadata doesn't exist in DB?
2. `credits` metadata is missing or invalid?

**Suggested approach:** Log error, do NOT retry (return 200 to Stripe to prevent infinite retries). Add monitoring/alerting.

### `[GAP]` Scope Path Discrepancy

Task specifies scope: `apps/api/src/lib/stripe/handlers/`

But existing handler is at: `apps/api/src/handlers/stripe.ts`

**Suggested approach:** Implement in existing `apps/api/src/handlers/stripe.ts` to maintain consistency with current codebase structure.

---

## Success Path (from plan/final.md)

1. Stripe sends `checkout.session.completed` webhook
2. Webhook route verifies signature
3. Webhook route emits `stripe:checkout.completed` event
4. Handler receives event
5. Handler checks if `stripe_session_id` already exists in `credit_ledger`
6. If exists: skip (idempotent), log, return
7. If not exists: insert row with `amount = credits`, `type = 'purchase'`, `expires_at = NOW + 6 months`
8. Return 200 to Stripe

---

## Validation Checklist

- [ ] Idempotency: Same webhook processed twice -> only 1 credit_ledger row
- [ ] Expiry: Credits expire 6 months from purchase
- [ ] Metadata extraction: `photographer_id` and `credits` correctly parsed
- [ ] Error cases: Missing metadata logged, 200 returned
- [ ] Build passes
- [ ] Unit tests cover happy path and idempotency
