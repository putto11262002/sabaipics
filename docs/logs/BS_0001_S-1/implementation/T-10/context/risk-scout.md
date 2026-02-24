# Risk Scout: T-10 Stripe Webhook Handler

**Root ID:** BS_0001_S-1
**Task:** T-10 - Stripe webhook handler for `checkout.session.completed`
**Date:** 2026-01-10
**Status:** Ready for implementation

---

## Executive Summary

T-10 is a **HIGH RISK** task involving financial transactions. The webhook handler must:

1. Verify Stripe webhook signatures (security)
2. Prevent double-crediting on duplicate webhooks (idempotency)
3. Add credits to photographer ledger with FIFO expiry (correctness)
4. Handle edge cases gracefully (resilience)

**Critical risk areas identified:**

- Double-crediting due to webhook retries
- Missing idempotency implementation in current handler shell
- Database transaction boundaries for credit insertion
- Metadata parsing failures causing silent fulfillment failures

---

## 1. Payment/Financial Risks

### 1.1 Double-Crediting (CRITICAL)

**Risk:** Stripe sends duplicate `checkout.session.completed` webhooks. Without proper idempotency, a single purchase could result in multiple credit additions.

**Evidence from Stripe docs (in `research/stripe-credit-flow.md`):**

> "Webhook endpoints might occasionally receive the same event more than once. Guard against duplicated event receipts by logging the event IDs you've processed."

**Current state analysis:**

- The `credit_ledger` table has `stripe_session_id` column (indexed) - **good foundation**
- The current handler in `apps/api/src/handlers/stripe.ts` is a shell with **no idempotency check**
- The research doc shows the intended pattern but it's not implemented

**Mitigation required:**

```sql
-- Check before insert
SELECT id FROM credit_ledger
WHERE stripe_session_id = :session_id
LIMIT 1;

-- If exists, skip processing (return 200 to Stripe)
```

**[GAP]** What happens if the DB check succeeds but insert fails? Need to clarify transaction boundaries.

### 1.2 Credit Expiry Calculation

**Risk:** Credits must expire 6 months from purchase. Incorrect calculation could lead to premature expiration or extended validity.

**Evidence from `plan/final.md`:**

> "Credit expiry: `expires_at = NOW() + 6 months`"

**Mitigation:** Use database timestamp arithmetic:

```typescript
expires_at = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000);
// Or SQL: NOW() + INTERVAL '6 months'
```

**[NEED_DECISION]** Is 6 months exactly 180 days, or calendar months (varying days)? Calendar months recommended for user-friendliness.

### 1.3 Missing Metadata in Webhook

**Risk:** If `checkout.session.completed` arrives without expected metadata (`photographer_id`, `credits`, `package_id`), fulfillment fails silently.

**Evidence from T-9 implementation (`credits.ts`):**

```typescript
metadata: {
  photographer_id: photographer.id,
  package_id: pkg.id,
  package_name: pkg.name,
  credits: pkg.credits.toString(),
}
```

**Mitigation:**

1. Validate metadata presence before processing
2. Return 200 to Stripe (prevent retries) but log error for manual reconciliation
3. Consider alerting (Sentry/PagerDuty) for missing metadata

---

## 2. Security Risks

### 2.1 Webhook Signature Verification (Implemented)

**Status:** Already implemented in `apps/api/src/routes/webhooks/stripe.ts`

**Evidence:**

```typescript
const event = await verifyWebhookSignature(stripe, rawBody, signature, c.env.STRIPE_WEBHOOK_SECRET);
```

**No additional risk here** - signature verification is in place using `STRIPE_WEBHOOK_SECRET` env var.

### 2.2 Replay Attacks

**Risk:** An attacker could capture a legitimate webhook and replay it to add credits multiple times.

**Mitigation:** Already handled by:

1. Stripe signature includes timestamp - stale webhooks are rejected
2. Idempotency check on `stripe_session_id` prevents duplicate processing

### 2.3 Secret Management

**Risk:** `STRIPE_WEBHOOK_SECRET` exposed in logs or code.

**Current state:**

- Secret is in `Bindings` type (`apps/api/src/types.ts`)
- Not hardcoded anywhere in source

**Mitigation:** Ensure no logging of `STRIPE_WEBHOOK_SECRET` value. The existing error handling logs error messages but not the secret.

---

## 3. Database Transaction Risks

### 3.1 Partial Inserts

**Risk:** If credit ledger insert succeeds but subsequent operations fail, the database state could be inconsistent.

**Operations that should be atomic:**

1. Check idempotency (SELECT)
2. Insert credit_ledger row (INSERT)
3. Optionally update photographer.stripe_customer_id if not set

**Mitigation:** Use database transaction:

```typescript
await db.transaction(async (tx) => {
  // Check idempotency
  const existing = await tx.query.creditLedger.findFirst({
    where: eq(creditLedger.stripeSessionId, session.id)
  });
  if (existing) return; // Already processed

  // Insert credit
  await tx.insert(creditLedger).values({...});
});
```

**[GAP]** Drizzle transaction support with Neon/Hyperdrive needs verification. Research shows Drizzle supports transactions but CF Workers + Hyperdrive may have limitations.

### 3.2 Race Conditions

**Risk:** Two webhook deliveries arrive simultaneously for the same session. Both pass the idempotency check before either inserts.

**Mitigation:**

- Add `UNIQUE` constraint on `credit_ledger.stripe_session_id` (already indexed)
- Database will reject second insert even if check passed

**Current schema analysis (`credit-ledger.ts`):**

```typescript
stripeSessionId: text("stripe_session_id"), // Nullable, only for purchases
```

**[GAP]** `stripe_session_id` does NOT have a UNIQUE constraint. Add unique constraint in migration.

---

## 4. Integration Risks with Stripe

### 4.1 Event Ordering

**Risk:** Stripe does not guarantee event delivery order. `payment_intent.succeeded` might arrive before `checkout.session.completed`.

**Evidence from research doc:**

> "Stripe doesn't guarantee the delivery of events in the order that they're generated."

**Mitigation:** The implementation should fulfill on `checkout.session.completed` only (not `payment_intent.succeeded`). The current handler shell already routes these separately.

### 4.2 PromptPay Async Payments

**Risk:** PromptPay (Thai QR payment) is asynchronous. Customer pays after leaving checkout, so `checkout.session.completed` fires with `payment_status: 'unpaid'`.

**Evidence from research doc:**

> "Handle `checkout.session.async_payment_succeeded` event"

**[NEED_DECISION]** For PromptPay, should we:

- A) Fulfill on `checkout.session.completed` if `payment_status === 'paid'` only
- B) Also listen for `checkout.session.async_payment_succeeded`

**Recommendation:** Option B - handle both events for full PromptPay support.

### 4.3 Webhook Endpoint Timeout

**Risk:** Cloudflare Workers have 30s CPU time limit. Complex DB operations could timeout.

**Mitigation:**

- Current handler is simple (check + insert) - should complete in <1s
- If needed, queue heavy processing and return 200 immediately

---

## 5. Edge Cases to Handle

### 5.1 Invalid Photographer ID in Metadata

**Scenario:** Metadata contains `photographer_id` that no longer exists in DB.

**Handling:**

- Log error with full session details
- Return 200 to Stripe (prevent retries)
- Alert for manual reconciliation
- DO NOT retry - photographer deletion is rare but valid

### 5.2 Zero Credits in Metadata

**Scenario:** `credits` metadata is "0" or negative.

**Handling:**

- Validate `credits > 0` before processing
- Log error, return 200, alert

### 5.3 Session Already Expired

**Scenario:** Webhook arrives for a session that was already expired/cancelled.

**Handling:**

- Check `session.payment_status === 'paid'` before fulfilling
- If not paid, log and skip (no alert needed)

### 5.4 Currency Mismatch

**Scenario:** Session has non-THB currency (unlikely but possible if Stripe config changes).

**Handling:**

- Log warning but still process (credits are currency-agnostic)
- Consider adding validation if this becomes an issue

---

## 6. Human-in-Loop Gates

### [NEED_DECISION] 6.1 Credit Expiry Calculation

**Question:** Is 6 months defined as:

- A) 180 days exactly
- B) Calendar months (varies: 28-31 days per month)

**Impact:** Affects user experience and edge cases around month boundaries.

**Recommendation:** Calendar months using `dateAdd(now(), 6, 'months')` for user-friendliness.

### [NEED_DECISION] 6.2 PromptPay Async Payment Handling

**Question:** Should T-10 also handle `checkout.session.async_payment_succeeded` for PromptPay?

**Options:**

- A) Only `checkout.session.completed` with `payment_status === 'paid'` - simpler, misses async payments
- B) Also `checkout.session.async_payment_succeeded` - full support, more complexity

**Recommendation:** Option B for Thai market.

### [GAP] 6.3 Unique Constraint on stripe_session_id

**Issue:** The `credit_ledger.stripe_session_id` column lacks a UNIQUE constraint, allowing potential race condition duplicates.

**Action Required:** Add migration to add unique constraint:

```sql
ALTER TABLE credit_ledger
ADD CONSTRAINT credit_ledger_stripe_session_unique
UNIQUE (stripe_session_id);
```

### [GAP] 6.4 Alerting for Failed Fulfillment

**Issue:** No alerting mechanism defined for:

- Missing metadata in webhook
- Invalid photographer_id
- Database errors during fulfillment

**Question:** Should we integrate Sentry/logging for production monitoring?

---

## 7. Merge Conflict Hotspots

### 7.1 `apps/api/src/handlers/stripe.ts`

**Risk Level:** MEDIUM

**Current state:** Shell implementation with TODO comments.

**Parallel work:** None currently, but future handlers may edit this file.

**Mitigation:** Complete T-10 before any parallel payment-related work.

### 7.2 `packages/db/src/schema/credit-ledger.ts`

**Risk Level:** LOW

**Potential conflict:** If T-16 (Upload) modifies credit ledger schema.

**Mitigation:** T-16 depends on T-10 in the dependency graph, so no conflict expected.

### 7.3 `apps/api/src/routes/webhooks/stripe.ts`

**Risk Level:** LOW

**Current state:** Already handles routing for `checkout.session.completed`.

**T-10 scope:** Only modifies handler, not router.

---

## 8. Test Coverage Requirements

### 8.1 Unit Tests (Required)

1. **Idempotency test:** Same session ID twice should result in one credit entry
2. **Metadata validation:** Missing `photographer_id` or `credits` should log error, not throw
3. **Credit calculation:** `expires_at` should be 6 months in future
4. **Payment status check:** Only fulfill if `payment_status === 'paid'`

### 8.2 Integration Tests (Required)

1. **Full webhook flow:** Verify signature -> extract metadata -> insert credit -> return 200
2. **Database transaction:** Concurrent requests don't create duplicates
3. **Invalid photographer:** Returns 200 (no Stripe retry) but logs error

### 8.3 Manual Validation

1. **Stripe CLI test:** `stripe trigger checkout.session.completed`
2. **Stripe Dashboard:** Verify webhook delivery logs
3. **Database:** Verify credit_ledger row created with correct values

---

## 9. Existing Infrastructure to Leverage

| Component            | Location                                   | Status | Usage in T-10                    |
| -------------------- | ------------------------------------------ | ------ | -------------------------------- |
| Webhook route        | `apps/api/src/routes/webhooks/stripe.ts`   | Ready  | Routes event to handler          |
| Handler shell        | `apps/api/src/handlers/stripe.ts`          | Shell  | Add fulfillment logic            |
| Signature verify     | `apps/api/src/lib/stripe/webhook.ts`       | Ready  | Already used                     |
| Credit ledger schema | `packages/db/src/schema/credit-ledger.ts`  | Ready  | Insert target                    |
| Test fixtures        | `apps/api/tests/fixtures/stripe-events.ts` | Ready  | `createCheckoutCompletedEvent()` |

---

## 10. Implementation Checklist

- [ ] Add unique constraint migration for `stripe_session_id`
- [ ] Implement idempotency check in handler
- [ ] Validate metadata (photographer_id, credits required)
- [ ] Insert credit_ledger row in transaction
- [ ] Calculate expires_at (6 calendar months)
- [ ] Return 200 for all paths (prevent Stripe retries)
- [ ] Log errors for manual reconciliation
- [ ] Add unit tests for idempotency, validation, expiry
- [ ] Add integration test for full flow
- [ ] Test with Stripe CLI webhook trigger
- [ ] (Optional) Add `checkout.session.async_payment_succeeded` handler for PromptPay

---

## References

- Task definition: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/tasks.md` (T-10 section)
- Stripe research: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/research/stripe-credit-flow.md`
- T-9 implementation: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/implementation/T-9/summary/iter-001.md`
- Credit ledger schema: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/credit-ledger.ts`
- Existing handler shell: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/handlers/stripe.ts`
- Webhook router: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/webhooks/stripe.ts`
