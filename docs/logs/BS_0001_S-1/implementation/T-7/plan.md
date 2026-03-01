# Implementation Plan

Task: `T-7 — Dashboard API`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-10`
Owner: `Claude`

## Inputs

- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: T-7)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-7/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-7/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-7/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-7/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-7/context/risk-scout.md`

## Goal / non-goals

- **Goal:** Create `GET /dashboard` endpoint returning credit balance, events list, and stats for the authenticated photographer
- **Non-goals:**
  - Pagination for events (not in spec, can be added later if needed)
  - Caching (premature optimization)
  - Event CRUD operations (separate task T-13)

## Approach (data-driven)

Based on codebase exemplars (`apps/api/src/routes/consent.ts`):

1. **Create dashboard router** at `apps/api/src/routes/dashboard.ts`
   - Use `Hono<Env>` with `PhotographerVariables`
   - Apply `requirePhotographer()` and `requireConsent()` middleware chain

2. **Implement three aggregation queries:**
   - **Credit balance:** `COALESCE(SUM(amount), 0)` where `expires_at > NOW()`
   - **Nearest expiry:** `MIN(expires_at)` from purchase rows (`amount > 0`) where `expires_at > NOW()`
   - **Events with counts:** Single query with correlated subqueries for `photoCount` and `faceCount`

3. **Compute total stats** by summing from events query results (avoid extra query)

4. **Response shape** (matching plan spec + additions from risk scout):

```typescript
{
  data: {
    credits: { balance: number, nearestExpiry: string | null },
    events: [{
      id: string,
      name: string,
      photoCount: number,
      faceCount: number,
      createdAt: string,
      expiresAt: string,
      startDate: string | null,
      endDate: string | null
    }],
    stats: { totalPhotos: number, totalFaces: number }
  }
}
```

5. **Register route** in `apps/api/src/index.ts` after Clerk middleware

## Contracts (only if touched)

- **API:**
  - `GET /dashboard` - Returns dashboard data for authenticated photographer
  - Auth: Requires Clerk session + photographer record + PDPA consent
  - Errors: 401 (unauthenticated), 403 (no photographer or no consent)

## Success path

1. User authenticates via Clerk
2. `requirePhotographer()` validates and loads photographer context
3. `requireConsent()` checks PDPA consent
4. Handler executes three queries in parallel (credits, events)
5. Response assembled and returned with `{ data: {...} }`

## Failure modes / edge cases (major only)

- **New user (no credits/events):** Returns `{ balance: 0, nearestExpiry: null, events: [], stats: { totalPhotos: 0, totalFaces: 0 } }`
- **All credits expired:** `balance: 0`, `nearestExpiry: null`
- **Expired events:** Included in list (filter in UI if needed)
- **No PDPA consent:** 403 with `FORBIDDEN` error code

## Validation plan

- **Tests to add:**
  1. Auth tests (401, 403 for no photographer, 403 for no consent)
  2. Empty state test (new user)
  3. Credit balance calculation with mixed expired/valid entries
  4. Nearest expiry calculation
  5. Events ordering (desc by createdAt)
  6. Photo/face count aggregation
- **Commands to run:**
  - `pnpm --filter=@sabaipics/api test` (unit tests)
  - `pnpm typecheck` (type checking)

## Rollout / rollback

- Low risk (read-only endpoint, no mutations)
- No migrations needed
- Feature flag not required

## Open questions

None - all decisions resolved:

- **nearestExpiry:** Use simple MIN of purchase `expires_at` (MVP approach)
- **PDPA consent:** Required via `requireConsent()` middleware
- **Expired events:** Include in response (UI can filter)
- **Extra fields:** Include `expiresAt`, `startDate`, `endDate` in events

## Files to create/modify

| File                                    | Action             |
| --------------------------------------- | ------------------ |
| `apps/api/src/routes/dashboard.ts`      | Create             |
| `apps/api/src/routes/dashboard.test.ts` | Create             |
| `apps/api/src/index.ts`                 | Modify (add route) |
