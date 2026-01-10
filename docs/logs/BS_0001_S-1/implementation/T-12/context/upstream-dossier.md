# Upstream Dossier

Task: T-12 — Credit packages page UI
Root: BS_0001_S-1
Date: 2026-01-10

## Task definition (from tasks.md)

### T-12 — Credit packages page UI
- [ ] Done
- **Type:** `feature`
- **StoryRefs:** US-4
- **Goal:** Create dedicated `/credits/packages` page for browsing and purchasing credit packages.
- **PrimarySurface:** `UI`
- **Scope:** `apps/dashboard/src/routes/credits/`
- **Dependencies:** `T-8`, `T-9`
- **Acceptance:**
  - Displays all active packages with price and credit amount
  - Select package → calls checkout API → redirects to Stripe
  - Success page after return from Stripe
  - Error handling for failed payments
- **Tests:**
  - Component tests for package cards
  - E2E test purchase flow (Stripe test mode)
- **Rollout/Risk:**
  - Medium risk (payment UX)
  - Test on mobile

## Upstream plan context (from plan/final.md)

### US-4: Credit purchase (Phase 2: Dashboard)

**Flow:**

| Step | Surface | Action |
|------|---------|--------|
| 1 | UI | Click "Buy Credits" → navigate to `/credits/packages` |
| 2 | API | `GET /credit-packages` |
| 3 | UI | Select package |
| 4 | API | `POST /credits/checkout` |
| 5 | External | Stripe Checkout (PromptPay enabled) |
| 6 | Webhook | `checkout.session.completed` → insert credit_ledger |
| 7 | UI | Success → dashboard with updated balance |

**Credit expiry:** `expires_at = NOW() + 6 months`

### API Summary (relevant endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /credit-packages | List packages |
| POST | /credits/checkout | Create Stripe session |

### Decision: Credit packages UI (Decision #11)

**Resolution:** Dedicated page at `/credits/packages`

This confirms T-12 is required (not embedded in dashboard).

### Architecture: Credit Deduction Flow

```
Upload Request
     │
     ▼
┌─────────────┐
│ Validation  │ ◄── Format, size, auth, credits check
└─────────────┘
     │
     ├── FAIL → 400 error, NO credit deducted
     │
     ▼ PASS
┌─────────────┐
│ Deduct 1    │ ◄── Credit charged HERE (FIFO expiry)
│ Credit      │
└─────────────┘
```

**Key points:**
- Credits are deducted AFTER validation (user commits when selecting package)
- No refund on failures after deduction
- 6-month expiration from purchase date
- FIFO expiry inheritance for deductions

### Architecture: Credit Ledger Mechanics

**Model:** Append-only ledger with FIFO expiry inheritance.

**Table structure:**
```
| amount | type     | expires_at | created_at |
|--------|----------|------------|------------|
| +100   | purchase | 2026-07-09 | 2026-01-09 |  ← Buy 100, expires in 6 months
| -1     | upload   | 2026-07-09 | 2026-01-10 |  ← Deduction inherits expiry
```

**Balance calculation:**
```sql
SELECT SUM(amount)
FROM credit_ledger
WHERE photographer_id = ?
  AND expires_at > NOW()
```

### Success Path (relevant steps for T-12)

5. Goes to `/credits/packages`, buys 100 credits via PromptPay
6. Creates "Wedding 2026-01-15" event
7. Gets QR with search + slideshow URLs

### Database Schema (relevant tables)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `credit_packages` | id, name, credits, price_thb, active, sort_order | Admin-editable |
| `credit_ledger` | id, photographer_id, amount, type, stripe_session_id, expires_at, created_at | 6-month expiry |

### Phase 2: Dashboard (US-3, US-4)

**US-3: Dashboard display**

API:
```
GET /dashboard
Response: {
  credits: { balance, nearestExpiry? },
  events: [{ id, name, photoCount, faceCount, createdAt }],
  stats: { totalPhotos, totalFaces }
}
```

**US-4: Credit purchase**

See flow above. The `/credits/packages` page is the main UI for this user story.

## Linked ADRs / research

### Research: Stripe Credit Purchase Flow (stripe-credit-flow.md)

**Primary Recommendation:** Option A (Checkout Sessions, Stripe-Hosted)

**Flow:**
```
1. Photographer selects credit package in dashboard
2. API creates Checkout Session with metadata (photographer_id, credits, package_name)
3. Redirect to Stripe-hosted page
4. Photographer completes payment
5. Stripe sends checkout.session.completed webhook
6. Handler creates payment record + adds credits to ledger
7. Redirect to success page (show confirmation)
```

**Pros:**
- Already implemented in codebase (`checkout.ts`)
- PCI compliance handled by Stripe
- Supports Thai payment methods (PromptPay) automatically
- Minimal frontend work
- Automatic payment method support updates
- Built-in error handling and retries

**Cons:**
- Redirect away from app (UX friction)
- Less branding control (can customize colors/logo)
- Depends on webhook reliability

**Credit Package Definition (Sub-Decision):**

**Recommendation:** Hardcode in API initially (Option A), migrate to database when admin UI is built.

```typescript
// apps/api/src/config/credit-packages.ts
export const CREDIT_PACKAGES = [
  { id: 'starter', name: 'Starter', credits: 100, priceCents: 29900, currency: 'thb' },
  { id: 'growth', name: 'Growth', credits: 500, priceCents: 99900, currency: 'thb' },
  { id: 'professional', name: 'Professional', credits: 1500, priceCents: 249900, currency: 'thb' },
  { id: 'studio', name: 'Studio', credits: 5000, priceCents: 699900, currency: 'thb' },
] as const;
```

**Fulfillment Strategy:**

**Webhook-primary with redirect display**

1. **Webhook** (`checkout.session.completed`): Primary fulfillment mechanism
   - Create payment record
   - Add credits to ledger
   - Use event.id for idempotency

2. **Success redirect**: Display-only confirmation
   - Retrieve session via `session_id` query param
   - Show payment details and new balance
   - Do NOT fulfill here (already done by webhook)

**Thai Market Considerations:**
- PromptPay is highly popular for local payments (zero fees for consumers)
- Credit card penetration is lower than Western markets
- Mobile banking apps are ubiquitous
- Consider enabling PromptPay for launch to maximize conversion

**THB Currency Support:**
- THB is a supported settlement currency with minimum charge of 10 THB (~$0.30 USD)
- THB is NOT a zero-decimal currency (use satang: 1 THB = 100 satang)
- Existing `checkout.ts` already defaults to `currency: 'thb'`

### Research: Cloudflare Upload Limits (cf-upload-limits.md)

**Note:** This research is about photo upload limits, not directly related to T-12. However, it provides context for why photographers need to purchase credits (1 credit per photo upload).

**Recommended Maximum Upload Size:** 50 MB

**Validation errors:**
| Error | Message |
|-------|---------|
| Wrong format | "Accepted formats: JPEG, PNG, HEIC, WebP" |
| Too large | "Maximum file size is 50MB" |
| No credits | "Insufficient credits. Purchase more to continue." |
| Event expired | "This event has expired" |

The "Insufficient credits" error is the key trigger that should prompt photographers to visit `/credits/packages`.

## Key constraints from upstream

1. **Page location:** Must be at `/credits/packages` (not embedded in dashboard)

2. **API integration:**
   - Call `GET /credit-packages` to fetch active packages
   - Call `POST /credits/checkout` with selected package ID to get Stripe session
   - Redirect to Stripe-hosted checkout URL
   - Handle success redirect back from Stripe

3. **Package display:**
   - Show only active packages
   - Display: name, credits, price in THB
   - Packages sorted by `sort_order`

4. **Checkout flow:**
   - Select package → calls checkout API → redirects to Stripe
   - PromptPay enabled (Thai market requirement)
   - Success page after return from Stripe with session details

5. **Error handling:**
   - Failed payments (card decline, etc.)
   - Cancelled checkout (user clicks back)
   - Invalid package selection
   - Network errors during API calls

6. **Mobile-first:**
   - Must test on mobile (Thai users primarily mobile)
   - PromptPay QR scanning UX important

7. **Success page:**
   - Display-only confirmation (credits already added via webhook)
   - Show payment details and new balance
   - Link back to dashboard
   - Do NOT attempt to fulfill credits on redirect (webhook handles it)

8. **Testing requirements:**
   - Component tests for package cards
   - E2E test purchase flow (Stripe test mode)
   - Test on mobile devices

9. **Risk mitigation:**
   - Medium risk (payment UX critical)
   - Clear loading states during API calls
   - Clear error messages for failed payments
   - Fallback for webhook failures (Stripe retries automatically)

10. **Currency display:**
    - All prices in THB
    - Use satang for API (1 THB = 100 satang)
    - Display format: "฿299" or "299 THB"

11. **Existing infrastructure:**
    - `apps/api/src/lib/stripe/checkout.ts` already has `createCheckoutSession()`
    - Webhook handler at `apps/api/src/routes/webhooks/stripe.ts` already routes events
    - Credit ledger schema already defined

12. **Out of scope for T-12:**
    - Admin UI for managing packages (Phase 0 uses admin API only)
    - Credit usage/balance display (that's in T-11 dashboard)
    - Promo codes/discounts
    - Subscription billing
    - Email/LINE notifications for purchase completion
