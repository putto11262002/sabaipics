# Implementation Summary (iter-001)

Task: `T-8 — Credit packages public API`
Root: `BS_0001_S-1`
Branch: `task/T-8-credit-packages-public-api`
PR: pending
Date: `2026-01-10`

## Outcome

Successfully implemented `GET /credit-packages` public endpoint that returns active credit packages for purchase.

## Key code changes

- `apps/api/src/routes/credits.ts` — New public API route file with GET /credit-packages endpoint
- `apps/api/src/routes/credits.test.ts` — Unit tests covering happy path, empty state, filtering, and response shape
- `apps/api/src/index.ts` — Registered creditsRouter before Clerk auth middleware to make it public

## Behavioral notes

- Success path: Returns active packages sorted by sortOrder in { data: [...] } envelope
- Key failure modes handled:
  - No active packages → Returns { data: [] } (empty array, not an error)
  - DB connection error → Propagates as 500 (Hono default error handling)
- Public endpoint: No authentication required (registered before Clerk middleware)
- Price unit: Stored in satang (29900 = 299 THB), API returns raw value for frontend to format

## Ops / rollout

- No flags/env vars required
- No migrations/run order required (credit_packages table exists from T-1)
- Prerequisite: Admin should seed at least one active package via T-3 admin API

## How to validate

- Commands run:
  - `pnpm install` — Installed updated dependencies
  - `pnpm --filter=@sabaipics/api test` — All 45 tests passed (including 5 new credits tests)
  - `pnpm --filter=@sabaipics/api build` — TypeScript compilation successful
- Key checks:
  - Public endpoint accessible without auth
  - Returns only active packages
  - Sorted by sortOrder ascending
  - Response shape matches { data: [{ id, name, credits, priceThb }] }

## Follow-ups

- None

## Test results

```
RUN  v3.2.4 /Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/api

✓ src/lib/line/webhook.test.ts (13 tests) 18ms
✓ src/lib/rekognition/rekognition.test.ts (11 tests) 7ms
✓ src/routes/credits.test.ts (5 tests) 7ms
✓ src/routes/consent.test.ts (6 tests) 11ms
✓ src/routes/admin/credit-packages.test.ts (10 tests) 18ms

Test Files  5 passed (5)
Tests       45 passed (45)
```
