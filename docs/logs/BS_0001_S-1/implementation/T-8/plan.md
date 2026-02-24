# Implementation Plan

Task: `T-8 — Credit packages public API`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-10`
Owner: `implementv3`

## Inputs

- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: `T-8`)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-8/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-8/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-8/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-8/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-8/context/risk-scout.md`

## Goal / non-goals

- **Goal:** Create `GET /credit-packages` endpoint returning active packages for purchase
- **Non-goals:** Credit purchase flow (T-9), credit packages UI (T-12), Stripe integration

## Approach (data-driven)

### 1. Create new route file: `apps/api/src/routes/credits.ts`

- Public GET endpoint (no auth required)
- Query `credit_packages` table where `active = true`
- Sort by `sortOrder` ASC
- Return `{ data: [...] }` with fields: `id`, `name`, `credits`, `priceThb`
- No validation needed (simple GET with no params)

### 2. Register router in `apps/api/src/index.ts`

- Import `creditsRouter` from `./routes/credits`
- Register BEFORE Clerk auth middleware (line 54) to make it public
- Route pattern: `.route("/credit-packages", creditsRouter)`

### 3. Create unit tests: `apps/api/src/routes/credits.test.ts`

- Test happy path: returns active packages sorted by sortOrder
- Test empty result: returns empty array when no active packages
- Test filtering: inactive packages not returned
- Use Hono `testClient` with mock DB

### 4. Run tests and verify

- Execute `pnpm --filter=@sabaipics/api test`
- Verify all tests pass

## Contracts (only if touched)

### DB

- **Table:** `credit_packages` (exists from T-1)
- **Query:**
  ```sql
  SELECT id, name, credits, price_thb
  FROM credit_packages
  WHERE active = true
  ORDER BY sort_order ASC
  ```

### API

- **Endpoint:** `GET /credit-packages`
- **Auth:** None (public)
- **Request:** No body/query params
- **Response (200 OK):**
  ```typescript
  {
    data: [
      {
        id: string, // UUID
        name: string, // Package name
        credits: number, // Number of credits
        priceThb: number, // Price in satang (29900 = 299 THB)
      },
    ];
  }
  ```
- **Error (500):** `{ error: { code: "INTERNAL_ERROR", message: "..." } }`

### Jobs/events

- None

## Success path

1. Client calls `GET /credit-packages` (no auth headers)
2. Handler queries DB for `active = true` packages, ordered by `sortOrder`
3. Returns `{ data: [...] }` with active packages
4. Frontend displays packages for purchase (T-12)

## Failure modes / edge cases (major only)

| Case                  | Behavior                                           |
| --------------------- | -------------------------------------------------- |
| No active packages    | Return `{ data: [] }` (empty array) - not an error |
| DB connection error   | Return 500 with error message                      |
| All packages inactive | Return `{ data: [] }`                              |

## Validation plan

### Tests to add

- `apps/api/src/routes/credits.test.ts`:
  1. Returns active packages sorted by sortOrder
  2. Returns empty array when no active packages
  3. Excludes inactive packages
  4. Response shape matches expected contract

### Commands to run

```bash
pnpm --filter=@sabaipics/api test    # Run tests
pnpm --filter=@sabaipics/api typecheck  # Type check
```

## Rollout / rollback

- **Risk:** Low (read-only endpoint, no schema changes)
- **Rollout:** Deploy via `wrangler deploy` after PR merge
- **Rollback:** Remove route registration from `index.ts` and redeploy
- **Prerequisite:** T-3 must have seeded at least one active package for meaningful testing

## Open questions

- **[RESOLVED]** Price unit: Stored in satang (29900 = 299 THB), API returns raw value
- **[RESOLVED]** Empty state: Return empty array `[]`
- **[RESOLVED]** Field naming: Use `priceThb` (camelCase) to match admin API and TypeScript conventions

## Implementation checklist

- [ ] Create `apps/api/src/routes/credits.ts`
- [ ] Create `apps/api/src/routes/credits.test.ts`
- [ ] Register `creditsRouter` in `apps/api/src/index.ts` (before Clerk auth)
- [ ] Run tests: `pnpm --filter=@sabaipics/api test`
- [ ] Run typecheck: `pnpm --filter=@sabaipics/api typecheck`
