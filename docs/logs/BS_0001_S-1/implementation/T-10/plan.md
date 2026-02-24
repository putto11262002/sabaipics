# Implementation Plan

Task: `T-10 — Stripe webhook handler`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-10`
Owner: `Claude`

## Inputs

- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: `T-10`)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-10/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-10/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-10/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-10/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-10/context/risk-scout.md`

## Goal / non-goals

- **Goal:** Handle `checkout.session.completed` webhook to add credits to photographer's ledger with FIFO expiry and idempotency.
- **Non-goals:** PromptPay async payment handling (follow-up), alerting/monitoring integration, payments table.

## Approach (data-driven)

Implement fulfillment logic directly in the webhook route (`apps/api/src/routes/webhooks/stripe.ts`) where we have db access via `c.var.db`. Skip the event bus abstraction for DB operations.

**Key decisions:**

1. **Direct route implementation** - No event bus for fulfillment, just call db directly in the webhook route
2. **Idempotency via unique constraint** - Add `UNIQUE` constraint on `stripe_session_id` to prevent race conditions at DB level
3. **6 calendar months expiry** - Use `date-fns` `addMonths()` for user-friendly expiry
4. **Payment status check** - Only fulfill if `payment_status === 'paid'`

**Files to modify:**

| File                                      | Change                                                     |
| ----------------------------------------- | ---------------------------------------------------------- |
| `packages/db/src/schema/credit-ledger.ts` | Add unique constraint on `stripe_session_id`               |
| `apps/api/src/routes/webhooks/stripe.ts`  | Add fulfillment logic in `checkout.session.completed` case |
| `apps/api/tests/stripe.test.ts`           | Add tests for credit insertion and idempotency             |

## Contracts (only if touched)

### DB: credit_ledger insert

```typescript
{
  photographerId: string,      // from metadata.photographer_id
  amount: number,              // parseInt(metadata.credits, 10)
  type: "purchase",
  stripeSessionId: string,     // session.id (idempotency key)
  expiresAt: Date,             // addMonths(new Date(), 6)
}
```

### API: Webhook response

- Always return `200 { received: true }` after signature verification (prevent Stripe retries)
- Log errors for manual reconciliation but don't fail the response

## Success path

1. Stripe sends `checkout.session.completed` webhook
2. Route verifies signature (already implemented)
3. Check `session.payment_status === 'paid'` - if not, skip (log, return 200)
4. Extract `photographer_id` and `credits` from metadata
5. Validate metadata present and valid
6. Insert into `credit_ledger` with `stripeSessionId = session.id`
   - If unique constraint violation (duplicate), log and return 200 (idempotent)
7. Return 200 to Stripe

## Failure modes / edge cases (major only)

| Scenario                                   | Handling                                                       |
| ------------------------------------------ | -------------------------------------------------------------- |
| Duplicate webhook (same session.id)        | Unique constraint rejects insert, catch error, log, return 200 |
| Missing metadata (photographer_id/credits) | Log error, return 200 (no retry), manual reconciliation        |
| Invalid photographer_id (not UUID)         | Log error, return 200                                          |
| Photographer not in DB                     | FK constraint fails, log error, return 200                     |
| `payment_status !== 'paid'`                | Skip fulfillment, log info, return 200                         |

## Validation plan

- **Tests to add:**
  1. Happy path: webhook inserts credit_ledger row with correct values
  2. Idempotency: same session.id twice → only 1 row, both return 200
  3. Missing metadata: logs error, returns 200, no row inserted
  4. Unpaid status: skips fulfillment, returns 200

- **Commands to run:**
  - `pnpm --filter=@sabaipics/api test` - run API tests
  - `pnpm build` - verify build passes
  - `pnpm --filter=@sabaipics/db generate` - generate migration if schema changes

## Rollout / rollback

- **Migration required:** Add unique constraint on `credit_ledger.stripe_session_id`
- **Rollback:** Remove constraint, revert code changes
- **Monitoring:** Check Stripe webhook dashboard for delivery failures

## Open questions

_None - all questions resolved:_

- ~~Credit expiry~~ → 6 calendar months using `addMonths()`
- ~~PromptPay~~ → Out of scope, follow-up task
- ~~Unique constraint~~ → Will add migration
