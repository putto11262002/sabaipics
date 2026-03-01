# Upstream Dossier: T-8

## Task (from tasks.md)

### T-8 — Credit packages public API

- [ ] Done
- **Type:** `feature`
- **StoryRefs:** US-4
- **Goal:** Create `GET /credit-packages` endpoint returning active packages for purchase.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/credits.ts`
- **Dependencies:** `T-1`, `T-2`
- **Acceptance:**
  - Returns only active packages
  - Sorted by sort_order
  - Includes id, name, credits, priceTHB
- **Tests:**
  - Unit test filtering active only
- **Rollout/Risk:**
  - Low risk

---

## Upstream plan (from final.md)

### US-4: Credit purchase flow

| Step | Surface  | Action                                                |
| ---- | -------- | ----------------------------------------------------- |
| 1    | UI       | Click "Buy Credits" → navigate to `/credits/packages` |
| 2    | API      | `GET /credit-packages`                                |
| 3    | UI       | Select package                                        |
| 4    | API      | `POST /credits/checkout`                              |
| 5    | External | Stripe Checkout (PromptPay enabled)                   |
| 6    | Webhook  | `checkout.session.completed` → insert credit_ledger   |
| 7    | UI       | Success → dashboard with updated balance              |

**Credit expiry:** `expires_at = NOW() + 6 months`

### Database Schema: credit_packages

| Table             | Key Columns                                      | Notes          |
| ----------------- | ------------------------------------------------ | -------------- |
| `credit_packages` | id, name, credits, price_thb, active, sort_order | Admin-editable |

### API Contract

**Endpoint:** `GET /credit-packages`

**Response:**

```typescript
{
  packages: [
    {
      id: string,
      name: string,
      credits: number,
      priceTHB: number,
    },
  ];
}
```

**Requirements:**

- Return only packages where `active = true`
- Sort by `sort_order` ASC
- No authentication required (public endpoint)

### Decision Context (from final.md)

| #   | Decision           | Resolution                   |
| --- | ------------------ | ---------------------------- |
| 3   | Credit packages    | Store in DB (admin-editable) |
| 9   | Credit expiration  | 6 months from purchase       |
| 11  | Credit packages UI | Dedicated page               |

---

## Linked ADRs

None. T-8 is a straightforward feature task with no architectural decisions.

---

## Linked Research

T-8 references `docs/logs/BS_0001_S-1/research/stripe-credit-flow.md` for context on the overall credit purchase flow, but T-8 itself is just the read-only public API. The research doc covers:

- Stripe Checkout integration (for T-9)
- Webhook handling (for T-10)
- Credit ledger mechanics (for T-10)

---

## Key constraints / invariants

### API Design

- **Public endpoint:** No authentication required
- **Active packages only:** Filter `WHERE active = true`
- **Sort order:** Must return packages in `sort_order ASC`
- **Response shape:** Must include `id`, `name`, `credits`, `priceTHB`

### Data Model

- **Source of truth:** `credit_packages` table (admin-managed via T-3)
- **Price currency:** Always THB (Thai Baht)
- **Package state:** Only return `active = true` packages

### Integration Points

- **Called by:** T-12 (Credit packages UI) at `/credits/packages` page
- **Downstream:** Selected package ID passed to T-9 (`POST /credits/checkout`)

### Testing Requirements

- Unit test: Verify `active = true` filter works
- Unit test: Verify sort order is correct
- Integration: Test with seed data from T-3

### Rollout Considerations

- **Low risk:** Read-only endpoint, no mutations
- **Prerequisite:** T-3 must seed initial packages
- **Dependency:** T-2 (requirePhotographer middleware) not needed (public endpoint)
