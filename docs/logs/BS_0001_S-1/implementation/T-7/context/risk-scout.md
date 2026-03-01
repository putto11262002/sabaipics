# Risk Scout Report: T-7 Dashboard API

**Task:** Create `GET /dashboard` endpoint returning credit balance, events list, and stats.
**Execution root:** `BS_0001_S-1`
**Generated:** 2026-01-10

---

## 1. Database Query Complexity

### FIFO Credit Balance Calculation

The plan specifies (from `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/plan/final.md`):

```sql
SELECT SUM(amount)
FROM credit_ledger
WHERE photographer_id = ?
  AND expires_at > NOW()
```

**[RISK] Credit balance edge cases with expiration**

- **Scenario 1:** Credits expire between request and response - minor UX issue, acceptable
- **Scenario 2:** Deduction entries inherit FIFO expiry from purchase - sum still works correctly
- **Scenario 3:** All credits expired - returns 0 or NULL, need explicit COALESCE

**Mitigation:** Use `COALESCE(SUM(amount), 0)` in query:

```typescript
const [result] = await db
  .select({ balance: sql`COALESCE(SUM(${creditLedger.amount}), 0)` })
  .from(creditLedger)
  .where(
    and(eq(creditLedger.photographerId, photographer.id), gt(creditLedger.expiresAt, sql`NOW()`)),
  );
```

### Nearest Expiry Query

**[RISK] Nearest expiry calculation complexity**

The response includes `nearestExpiry` - need to find the earliest `expires_at` from credits that still have positive balance.

**[NEED_DECISION] How to calculate nearestExpiry?**

Options:

- **A) Simple approach:** Just return the earliest `expires_at` from any non-expired credit_ledger row with positive amount (purchase rows only)
  - Pros: Simple query, O(1) with index
  - Cons: Doesn't account for partial consumption - may show expiry date of fully-consumed purchase
- **B) Accurate FIFO approach:** Calculate running balance per expiry bucket, find first non-exhausted bucket
  - Pros: Accurate
  - Cons: Complex query, potential performance issues

**Recommendation:** Option A for MVP - show earliest expiry of any purchase. The edge case (fully-consumed purchase) is rare and the UX difference is minimal.

```sql
SELECT MIN(expires_at) as nearestExpiry
FROM credit_ledger
WHERE photographer_id = ?
  AND expires_at > NOW()
  AND amount > 0
  AND type = 'purchase'
```

---

## 2. Performance Concerns

### Multiple Queries

The endpoint needs to fetch:

1. Credit balance (SUM on `credit_ledger`)
2. Nearest expiry date (MIN on `credit_ledger`)
3. Events list (SELECT from `events`)
4. Stats - totalPhotos, totalFaces (aggregations across `photos`, `faces`)

**[RISK] N+1 queries for stats per event**

If stats include per-event photo/face counts, naive implementation causes N+1:

```typescript
// BAD: N+1
const events = await db.select().from(events)...
for (const event of events) {
  const photos = await db.select().from(photos).where(eq(photos.eventId, event.id))
}
```

**Mitigation:** Use aggregation subqueries or left joins:

```typescript
const eventsWithCounts = await db
  .select({
    id: events.id,
    name: events.name,
    createdAt: events.createdAt,
    photoCount: sql<number>`(SELECT COUNT(*) FROM photos WHERE event_id = ${events.id})`,
    faceCount: sql<number>`(SELECT COALESCE(SUM(face_count), 0) FROM photos WHERE event_id = ${events.id})`,
  })
  .from(events)
  .where(eq(events.photographerId, photographer.id))
  .orderBy(desc(events.createdAt));
```

**[RISK] Stats aggregation across all photos/faces could be slow**

For photographers with many events/photos, computing `totalPhotos` and `totalFaces` requires table scans.

**Existing indexes** (from migration `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/drizzle/0001_ambiguous_the_liberteens.sql`):

- `events_photographer_id_idx` ON `events(photographer_id)` - good for event filtering
- `photos_event_id_idx` ON `photos(event_id)` - good for per-event counts
- `credit_ledger_photographer_expires_idx` ON `credit_ledger(photographer_id, expires_at)` - good for credit queries

**Missing index:** No direct index for `photographer_id -> photos` join. Stats query must go through events.

**Mitigation options:**

1. Use subquery with existing indexes (acceptable for MVP)
2. Denormalize counts on `events` table (future optimization)
3. Cache stats (overkill for MVP)

**Recommendation:** Accept subquery approach for MVP. Monitor query times.

---

## 3. Security Considerations

### Authorization

**[RISK] Photographer can only see own data - must be enforced at query level**

Existing patterns from `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/middleware/require-photographer.ts`:

- `requirePhotographer()` middleware sets `c.var.photographer` with `{ id, pdpaConsentAt }`
- Use `photographer.id` in all WHERE clauses

**Critical:** Every query MUST filter by `photographer_id`:

```typescript
// Credits - filter by photographer
.where(eq(creditLedger.photographerId, photographer.id))

// Events - filter by photographer
.where(eq(events.photographerId, photographer.id))
```

**No data leakage vectors identified** - all entities have `photographer_id` FK.

### PDPA Consent Gate

**[NEED_DECISION] Should dashboard require PDPA consent?**

Options:

- **A) Yes, require consent** - Use `requireConsent()` middleware (already exists at `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/middleware/require-consent.ts`)
  - Pros: Strict compliance, consistent with plan
  - Cons: Blocks new users from seeing empty dashboard
- **B) No, allow without consent** - Show dashboard with consent prompt banner
  - Pros: Better onboarding UX, user sees the empty state
  - Cons: Minor compliance risk (though no data processing happens yet)

**Recommendation:** Option A - require consent. The consent modal is blocking per US-1 in plan. Dashboard access after consent is the expected flow.

Middleware chain:

```typescript
.get("/dashboard", requirePhotographer(), requireConsent(), async (c) => { ... })
```

---

## 4. Edge Cases

### New User With No Data

**[RISK] Empty state handling**

A photographer who just signed up will have:

- 0 credits (no ledger entries)
- No events
- 0 total photos, 0 total faces

**Required behavior:**

```typescript
// Response for new user
{
  credits: { balance: 0, nearestExpiry: null },
  events: [],
  stats: { totalPhotos: 0, totalFaces: 0 }
}
```

**Implementation:**

- `COALESCE(SUM(amount), 0)` for balance
- `nearestExpiry: null` when no unexpired purchases
- Empty array for events (natural result of query)
- 0 for stats via `COALESCE`

### Events With No Photos

An event created but not yet uploaded to should show:

```typescript
{ id, name, photoCount: 0, faceCount: 0, ... }
```

**Covered by:** `COALESCE` in subquery aggregations.

### Expired Events

**[GAP] Events.expires_at handling in dashboard**

The plan mentions `events.expires_at = created_at + 30 days`.

**Questions:**

1. Should expired events still show in dashboard list?
2. If shown, should they be visually distinguished?
3. Should stats include photos from expired events?

**[NEED_DECISION] Expired events in dashboard**

Options:

- **A) Show all events** - Expired events visible but marked
- **B) Filter to non-expired only** - WHERE `expires_at > NOW()`
- **C) Paginate with separate "expired" section** - More complex

**Recommendation:** Option A for MVP - show all events. The 30-day window means most recent events are still active. Add `isExpired` boolean to response for UI differentiation.

---

## 5. Response Schema

**From plan (`/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/plan/final.md`):**

```typescript
{
  credits: { balance: number, nearestExpiry?: string },
  events: [{ id, name, photoCount, faceCount, createdAt }],
  stats: { totalPhotos, totalFaces }
}
```

**[GAP] Missing fields in events response**

The plan specifies `{ id, name, photoCount, faceCount, createdAt }` but may want:

- `startDate`, `endDate` - for display
- `expiresAt` or `isExpired` - for UI differentiation
- `accessCode` - for QR display

**Recommendation:** Include in response:

```typescript
events: [
  {
    id: string,
    name: string,
    photoCount: number,
    faceCount: number,
    createdAt: string, // ISO 8601
    expiresAt: string, // ISO 8601
    startDate: string | null,
    endDate: string | null,
  },
];
```

Exclude `accessCode` and `qrCodeR2Key` from list (fetch in detail endpoint).

---

## 6. Merge Conflict Hotspots

**Files that may have parallel changes:**

1. **`apps/api/src/index.ts`** - Route registration
   - T-8 (Credit Packages API) and T-9 (Stripe Checkout API) will also add routes
   - Mitigation: Method chaining pattern allows easy merging

2. **`apps/api/src/middleware/index.ts`** - Middleware exports
   - Already exports `requirePhotographer`, `requireConsent`
   - Low conflict risk

3. **`packages/db/src/schema/` tables**
   - Schema is stable from T-1
   - Low conflict risk

**Recommendation:** Coordinate with T-8/T-9 on route naming. Consider grouping under `/dashboard` sub-router or separate `/credits` router.

---

## 7. Implementation Checklist

### Must Do

- [ ] Use `requirePhotographer()` + `requireConsent()` middleware
- [ ] Filter ALL queries by `photographer.id`
- [ ] Use `COALESCE` for null-safe aggregations
- [ ] Return empty state correctly for new users
- [ ] Use existing composite index for credit queries

### Should Do

- [ ] Use subqueries for photo/face counts (avoid N+1)
- [ ] Include `expiresAt` in events response
- [ ] Add Zod schema for response type

### Consider

- [ ] Add response time logging
- [ ] Add cache headers (short TTL, user-specific)

---

## 8. Test Cases

### Unit Tests

1. Credit balance with no ledger entries -> 0
2. Credit balance with expired entries only -> 0
3. Credit balance with mix of expired/valid -> correct sum
4. Nearest expiry with no purchases -> null
5. Events list for photographer with no events -> []
6. Events list filters to correct photographer only
7. Stats aggregation with no photos -> { totalPhotos: 0, totalFaces: 0 }

### Integration Tests

1. Full flow: new user gets empty dashboard
2. Full flow: user with credits, events, photos gets correct data
3. Auth: unauthenticated request -> 401
4. Auth: authenticated but no photographer record -> 403
5. Auth: no PDPA consent -> 403

---

## Summary

| Category            | Item                        | Status                                            |
| ------------------- | --------------------------- | ------------------------------------------------- |
| **[RISK]**          | FIFO balance needs COALESCE | Mitigated - use COALESCE                          |
| **[RISK]**          | N+1 for event stats         | Mitigated - use subqueries                        |
| **[RISK]**          | Authorization leakage       | Mitigated - filter all queries by photographer_id |
| **[NEED_DECISION]** | nearestExpiry calculation   | Recommend: simple MIN of purchases                |
| **[NEED_DECISION]** | PDPA consent required?      | Recommend: Yes, use requireConsent()              |
| **[NEED_DECISION]** | Show expired events?        | Recommend: Yes, with isExpired flag               |
| **[GAP]**           | Events response fields      | Recommend: add expiresAt, startDate, endDate      |

---

## Provenance

**Files read:**

- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/tasks.md` - Task definition
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/plan/final.md` - Execution plan
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/credit-ledger.ts` - Schema
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/events.ts` - Schema
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/photos.ts` - Schema
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/drizzle/0001_ambiguous_the_liberteens.sql` - Indexes
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/middleware/require-photographer.ts` - Auth pattern
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/middleware/require-consent.ts` - Consent pattern
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/consent.ts` - Route pattern
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/index.ts` - App structure
