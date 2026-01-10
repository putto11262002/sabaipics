# Implementation Summary: T-3 Admin Credit Packages API

**Task:** T-3 — Admin credit packages API
**Root:** `BS_0001_S-1`
**Date:** 2026-01-10
**Iteration:** 1

---

## Overview

Implemented admin API for CRUD operations on credit packages. Uses `X-Admin-API-Key` header authentication (separate from Clerk auth).

**Design Decision:** Admin routes placed BEFORE Clerk middleware in the chain to avoid requiring user authentication.

---

## Files Created

| File | Purpose |
|------|---------|
| `apps/api/src/middleware/require-admin.ts` | API key authentication middleware |
| `apps/api/src/routes/admin/credit-packages.ts` | Credit package CRUD routes |
| `apps/api/src/routes/admin/index.ts` | Admin router barrel |
| `apps/api/src/routes/admin/credit-packages.test.ts` | Unit tests using Hono testClient |

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/middleware/index.ts` | Added `requireAdmin` export |
| `apps/api/src/index.ts` | Added admin router (placed before Clerk auth) |

---

## Key Components

### `requireAdmin()` — `apps/api/src/middleware/require-admin.ts`

```typescript
export function requireAdmin(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const apiKey = c.req.header("X-Admin-API-Key");
    if (!apiKey || apiKey !== c.env.ADMIN_API_KEY) {
      return c.json(createAuthError("UNAUTHENTICATED", "..."), 401);
    }
    return next();
  };
}
```

### Admin Routes — `apps/api/src/routes/admin/credit-packages.ts`

| Route | Description |
|-------|-------------|
| `GET /admin/credit-packages` | List all packages ordered by sortOrder |
| `POST /admin/credit-packages` | Create new package |
| `PATCH /admin/credit-packages/:id` | Update package by UUID |

**Validation:** Uses `zValidator` from `@hono/zod-validator` for type-safe request validation and testClient inference.

Schemas:
- `createPackageSchema`: name (required), credits, priceThb, active (default: true), sortOrder (default: 0)
- `updatePackageSchema`: All fields optional

---

## Route Wiring

```typescript
// apps/api/src/index.ts
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  .route("/webhooks", webhookRouter)
  .use("/*", cors(...))
  .use("/*", (c, next) => { c.set("db", () => createDb(...)); return next(); })
  // Admin routes - API key auth (before Clerk)
  .route("/admin", adminRouter)
  .use("/*", createClerkAuth())
  // ... rest of routes
```

---

## Testing Pattern

Uses Hono's `testClient` for type-safe testing:

```typescript
import { testClient } from "hono/testing";

const client = testClient(app, MOCK_ENV);

// GET
const res = await client["credit-packages"].$get(undefined, {
  headers: { "X-Admin-API-Key": TEST_API_KEY },
});

// POST
const res = await client["credit-packages"].$post(
  { json: { name: "Basic", credits: 100, priceThb: 299 } },
  { headers: { "X-Admin-API-Key": TEST_API_KEY } },
);

// PATCH
const res = await client["credit-packages"][":id"].$patch(
  { param: { id: MOCK_UUID }, json: { name: "Updated" } },
  { headers: { "X-Admin-API-Key": TEST_API_KEY } },
);
```

---

## Validation

- ✅ TypeScript build passes
- ✅ All tests pass (10 tests in credit-packages.test.ts)
