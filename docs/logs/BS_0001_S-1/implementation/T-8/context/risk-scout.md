# Risk Scout: T-8

**Task:** T-8 — Credit packages public API
**Type:** `feature`
**StoryRefs:** US-4
**Date:** 2026-01-10

---

## External dependencies

- **None** - This is a read-only public API endpoint that queries existing database records
- No external services or APIs required

---

## Data dependencies

### Tables required

- `credit_packages` - Created in T-1 (Foundation phase)

### Columns required

- `id` (uuid) - Package identifier
- `name` (text) - Package display name
- `credits` (integer) - Number of credits in package
- `priceThb` (integer) - Price in Thai Baht (stored as integer, comment says "satang (smallest unit) or whole baht")
- `active` (boolean) - Filter condition (only return `active = true`)
- `sortOrder` (integer) - Ordering field (ascending)

### Index requirements

- Index on `active` column for filtering performance
- Index on `sortOrder` column for ordering performance
- **Note:** Verify these indexes exist in migration created by T-1

---

## Hidden coupling

### If this endpoint is wrong/broken, it affects:

1. **T-12 (Credit Packages UI)** - UI will have no packages to display
   - Credit packages page (`/credits/packages`) will show empty list
   - Purchase flow completely blocked

2. **T-9 (Stripe Checkout API)** - Checkout endpoint relies on T-8 for package validation
   - T-9 needs to verify package exists and is active before creating Stripe session
   - If T-8 returns wrong data, checkout may reference invalid packages

3. **Upstream US-4** - Entire credit purchase workflow depends on this
   - Users cannot purchase credits without seeing available packages
   - Revenue impact if packages don't display correctly

### Coupling with T-3 (Admin Credit Packages API)

- T-8 reads from same `credit_packages` table that T-3 writes to
- T-3's data validation constraints must match T-8's query expectations
- **Risk:** If T-3 allows `priceThb = 0` or negative values, T-8 will display bad pricing

### Response shape coupling

- T-8 response contract must match T-12 (UI) expectations
- Frontend expects: `id`, `name`, `credits`, `priceTHB` (camelCase)
- Database has: `price_thb` (snake_case)
- **Need transformation layer** to convert snake_case to camelCase

---

## HI gates (require human approval)

### [GAP] Price currency unit clarification

**Issue:** Schema comment says "Store in satang (smallest unit) or whole baht"

- Thailand uses satang (1 THB = 100 satang)
- Unclear if `priceThb` should be stored as `299` (299 THB) or `29900` (29900 satang = 299 THB)
- Stripe research (`stripe-credit-flow.md`) suggests using satang for amounts

**Impact:** If wrong, prices displayed will be 100x too high or too low
**Decision needed:** Confirm price storage unit (THB vs satang)

### [GAP] Response field naming convention

**Issue:** Plan spec uses `priceTHB` (camelCase) but DB column is `price_thb` (snake_case)

- Admin API (T-3) returns `priceThb` (camelCase in TypeScript)
- Public API (T-8) should match for consistency
- Need explicit field mapping in response

**Decision needed:** Confirm API response uses camelCase (`priceThb`) to match TypeScript conventions

### [NEED_DECISION] Empty state handling

**Question:** What should happen if no active packages exist?

- Option A: Return empty array `[]` (RESTful, client handles empty state)
- Option B: Return 404 or error (indicates misconfiguration)
- Option C: Return hardcoded fallback packages (temporary measure)

**Recommendation:** Option A (empty array) - let UI display "No packages available" message

---

## Security / privacy concerns

### Low risk

- **Public endpoint** - No authentication required (by design)
- **Read-only** - No data mutation
- **No PII** - Only displays pricing, not user data

### Rate limiting consideration

- **Current risk:** No rate limiting specified
- **Recommendation:** Add Cloudflare Worker rate limiting to prevent abuse
- **Pattern:** Use existing `RekognitionRateLimiter` Durable Object pattern

### Data exposure

- **Low concern:** Only public pricing information
- **Note:** `active = false` packages are hidden (good for testing/unreleased packages)

---

## Failure modes

### Database failures

| Failure                         | Impact                       | Mitigation                              |
| ------------------------------- | ---------------------------- | --------------------------------------- |
| `credit_packages` table missing | 500 error                    | Run T-1 migration first                 |
| Missing indexes                 | Slow query on large datasets | Add `active` and `sortOrder` indexes    |
| No active packages              | Empty list displayed         | Seed initial packages via T-3 admin API |

### Query failures

| Failure                     | Impact      | Mitigation                    |
| --------------------------- | ----------- | ----------------------------- |
| Database connection timeout | 500 error   | Cloudflare Workers auto-retry |
| Invalid `sortOrder` values  | Wrong order | Validate in T-3 (admin API)   |

### Integration failures

| Failure                 | Impact                  | Mitigation                          |
| ----------------------- | ----------------------- | ----------------------------------- |
| Response shape mismatch | Frontend parsing errors | Match T-3 response format exactly   |
| Price unit confusion    | 100x wrong pricing      | **HI GATE** - clarify THB vs satang |

---

## Implementation risks

### Low risk overall

- Simple SELECT query with WHERE and ORDER BY
- No external dependencies
- No authentication complexity
- Straightforward response mapping

### Medium risk considerations

1. **Performance with many packages:** If 1000+ packages exist, query may be slow without proper indexes
   - **Mitigation:** Add composite index on `(active, sortOrder)`

2. **Caching:** No caching specified
   - **Recommendation:** Consider Cloudflare Workers KV cache for package list (TTL: 5 minutes)
   - Packages change infrequently, mostly via admin API

3. **Testing:** Need to verify `active = false` packages are truly hidden
   - **Test case:** Create inactive package via T-3, verify T-8 doesn't return it

---

## Dependencies on other tasks

### Must complete first

- **T-1 (DB Schema)** - `credit_packages` table must exist
- **T-3 (Admin Credit Packages API)** - Need at least one active package seeded

### Parallel work

- Can develop alongside T-7 (Dashboard API) - no shared code
- Frontend T-12 depends on this, but can be mocked during development

### Blocks

- **T-12 (Credit Packages UI)** - UI needs this endpoint to display packages
- **T-9 (Stripe Checkout API)** - Checkout validates package existence via T-8

---

## Test coverage requirements

### Unit tests

- [ ] Returns only active packages
- [ ] Orders by `sortOrder` ascending
- [ ] Returns empty array if no active packages
- [ ] Includes all required fields: id, name, credits, priceThB
- [ ] Field names use camelCase (not snake_case)

### Integration tests

- [ ] Query against real database with seeded packages
- [ ] Verify `active = false` packages are excluded
- [ ] Verify sort order respects `sortOrder` values

### Edge cases

- [ ] All packages inactive → empty array
- [ ] Single package → returns array with one item
- [ ] Packages with same `sortOrder` → stable order (secondary sort by id?)

---

## Monitoring & observability

### Metrics to track

- Request count (packages listed)
- Response time (p95, p99)
- Empty response rate (indicates configuration issue)

### Logging

- Log query parameters (none for GET)
- Log result count (number of packages returned)
- **Don't log:** Package details (PII not a concern, but unnecessary verbosity)

### Alerts

- Alert if response time > 500ms (indicates missing index)
- Alert if error rate > 1% (indicates DB connection issue)
- Alert if empty response rate > 50% (indicates no active packages configured)

---

## Summary

**Risk Level:** Low

**Critical Path:** Yes (blocks T-9, T-12)

**Key Risks:**

1. **HI GATE:** Price currency unit (THB vs satang) must be clarified
2. **HI GATE:** Response field naming (camelCase vs snake_case) needs confirmation
3. **Performance:** Missing indexes could cause slow queries with many packages

**Recommendations:**

1. Clarify price storage unit before implementation (1 min HI decision)
2. Confirm response uses camelCase to match TypeScript conventions (1 min HI decision)
3. Add composite index on `(active, sortOrder)` for performance
4. Consider KV caching for package list (5-minute TTL)
5. Write comprehensive tests for filtering and ordering logic
