# Implementation Plan: T-3 Admin Credit Packages API

**Task:** T-3 — Admin credit packages API
**Root:** `BS_0001_S-1`
**Date:** 2026-01-10
**Status:** Pending Approval

---

## Task Requirements (from tasks.md)

- `GET /admin/credit-packages` — returns all packages
- `POST /admin/credit-packages` — creates new package
- `PATCH /admin/credit-packages/:id` — updates package (price, credits, active status)
- Admin auth required (simple API key for MVP)
- Unit tests for CRUD operations
- Validation tests (required fields, positive amounts)

---

## Context from Previous Implementations

### From T-2 Summary (Middleware Pattern)

- Middlewares live in `apps/api/src/middleware/` (SabaiPics-specific business logic)
- DB access via `c.var.db()` (Drizzle client from context)
- Error format: `{ error: { code: string, message: string } }` via `createAuthError`
- Export types alongside middleware

### From Tech Stack

- Validation: Zod ^4.1.13
- Testing: Vitest ^3.2.0
- Framework: Hono ^4.10.7

### Database Schema (from T-1)

```typescript
// packages/db/src/schema/credit-packages.ts
creditPackages = pgTable('credit_packages', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  credits: integer('credits').notNull(),
  priceThb: integer('price_thb').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAtCol(),
});
```

---

## Files to Create/Modify

| File                                                | Action | Description                     |
| --------------------------------------------------- | ------ | ------------------------------- |
| `apps/api/src/middleware/require-admin.ts`          | Create | Admin API key middleware        |
| `apps/api/src/middleware/index.ts`                  | Modify | Export `requireAdmin`           |
| `apps/api/src/routes/admin/credit-packages.ts`      | Create | CRUD routes for credit packages |
| `apps/api/src/routes/admin/index.ts`                | Create | Admin router barrel             |
| `apps/api/src/index.ts`                             | Modify | Wire `/admin` routes            |
| `apps/api/src/routes/admin/credit-packages.test.ts` | Create | Unit tests                      |

---

## Implementation Details

### 1. Admin Auth Middleware (`require-admin.ts`)

**Purpose:** Verify admin API key for admin-only endpoints.

**Behavior:**

- Check `X-Admin-API-Key` header against `ADMIN_API_KEY` env binding
- Return 401 if header missing
- Return 401 if key doesn't match
- Bypasses Clerk auth (admin is not a photographer)

**Code Pattern:**

```typescript
import type { MiddlewareHandler } from 'hono';
import { createAuthError } from '@sabaipics/auth/errors';

type Env = {
  Bindings: { ADMIN_API_KEY: string };
};

export function requireAdmin(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const apiKey = c.req.header('X-Admin-API-Key');

    if (!apiKey) {
      return c.json(createAuthError('UNAUTHENTICATED', 'Admin API key required'), 401);
    }

    if (apiKey !== c.env.ADMIN_API_KEY) {
      return c.json(createAuthError('UNAUTHENTICATED', 'Invalid admin API key'), 401);
    }

    return next();
  };
}
```

---

### 2. Validation Schemas (inline in route file)

**Zod 4 schemas:**

```typescript
import { z } from 'zod';

const createPackageSchema = z.object({
  name: z.string().min(1).max(100),
  credits: z.number().int().positive(),
  priceThb: z.number().int().positive(),
  active: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const updatePackageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  credits: z.number().int().positive().optional(),
  priceThb: z.number().int().positive().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
```

---

### 3. Route Definitions (`credit-packages.ts`)

| Method | Path   | Description       | Response                    |
| ------ | ------ | ----------------- | --------------------------- |
| GET    | `/`    | List all packages | `{ data: CreditPackage[] }` |
| POST   | `/`    | Create package    | `{ data: CreditPackage }`   |
| PATCH  | `/:id` | Update package    | `{ data: CreditPackage }`   |

**GET /** — List all packages

- No request body
- Returns all packages ordered by `sortOrder` ASC
- Response: `{ data: CreditPackage[] }`

**POST /** — Create package

- Request body: `createPackageSchema`
- Validates input
- Inserts row, returns created package
- Response: `{ data: CreditPackage }` (201)
- Error: `{ error: { code, message } }` (400 for validation)

**PATCH /:id** — Update package

- Request body: `updatePackageSchema`
- Validates UUID param
- Validates input (at least one field required)
- Updates row, returns updated package
- Response: `{ data: CreditPackage }` (200)
- Error: `{ error: { code, message } }` (400 for validation, 404 if not found)

---

### 4. Response Format

**Success:**

```typescript
{ data: CreditPackage | CreditPackage[] }
```

**Validation Error (400):**

```typescript
{
  error: {
    code: "VALIDATION_ERROR",
    message: "Validation failed",
    details: ZodError["issues"]  // Optional: field-level errors
  }
}
```

**Not Found (404):**

```typescript
{ error: { code: "NOT_FOUND", message: "Credit package not found" } }
```

**Auth Error (401):**

```typescript
{ error: { code: "UNAUTHENTICATED", message: "Admin API key required" } }
```

---

### 5. Wiring in `index.ts`

```typescript
import { adminRouter } from "./routes/admin";

// Admin routes - before CORS/Clerk middleware (API key auth only)
.route("/admin", adminRouter)
```

**Note:** Admin routes should NOT go through Clerk auth middleware. They use API key authentication instead.

---

### 6. Tests (`credit-packages.test.ts`)

**Testing Pattern:** Use Hono's built-in testing utilities.

**References:**

- https://hono.dev/docs/guides/testing
- https://hono.dev/docs/helpers/testing

**Approach 1: `app.request()` method**

```typescript
import { describe, it, expect } from 'vitest';
import app from '../index'; // or create isolated test app

const MOCK_ENV = {
  ADMIN_API_KEY: 'test-admin-key',
  DATABASE_URL: 'mock-db-url',
};

describe('Admin Credit Packages API', () => {
  it('GET /admin/credit-packages returns all packages', async () => {
    const res = await app.request(
      '/admin/credit-packages',
      {
        headers: { 'X-Admin-API-Key': 'test-admin-key' },
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it('POST /admin/credit-packages creates package', async () => {
    const res = await app.request(
      '/admin/credit-packages',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Basic Pack',
          credits: 100,
          priceThb: 299,
        }),
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-API-Key': 'test-admin-key',
        },
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(201);
  });

  it('rejects request without API key', async () => {
    const res = await app.request('/admin/credit-packages', {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });
});
```

**Approach 2: `testClient()` for type-safe testing (if using chained routes)**

```typescript
import { testClient } from 'hono/testing';
import { adminCreditPackagesRouter } from './credit-packages';

const client = testClient(adminCreditPackagesRouter);

// Type-safe route calls with autocompletion
const res = await client.index.$get({}, { headers: { 'X-Admin-API-Key': 'test-key' } });
```

**Test Categories:**

1. **Auth Tests**
   - Reject request without API key (401)
   - Reject request with invalid API key (401)
   - Accept request with valid API key

2. **Validation Tests**
   - POST: Reject missing required fields (name, credits, priceThb)
   - POST: Reject non-positive credits
   - POST: Reject non-positive priceThb
   - POST: Reject name > 100 chars
   - PATCH: Reject invalid UUID
   - PATCH: Reject empty body (no fields to update)

3. **CRUD Tests**
   - GET: Returns all packages ordered by sortOrder
   - GET: Returns empty array when no packages
   - POST: Creates package with all fields
   - POST: Creates package with defaults (active=true, sortOrder=0)
   - PATCH: Updates single field
   - PATCH: Updates multiple fields
   - PATCH: Returns 404 for non-existent package

**DB Mocking Strategy:**

Pass mocked DB in env for isolated tests:

```typescript
const MOCK_ENV = {
  ADMIN_API_KEY: 'test-admin-key',
  DATABASE_URL: 'mock', // or inject mock db factory
};
```

---

## Environment Configuration

`ADMIN_API_KEY` must be set as a Cloudflare secret (not in wrangler.jsonc):

```bash
# Local development
echo "dev-admin-key" | wrangler secret put ADMIN_API_KEY

# Staging
wrangler secret put ADMIN_API_KEY --env staging

# Production
wrangler secret put ADMIN_API_KEY --env production
```

---

## Rollout Considerations

- **Risk:** Low (admin-only, no user-facing impact)
- **Dependencies:** T-1 (DB schema) - completed
- **Post-deploy:** Seed initial credit packages via API

---

## Open Questions

None - all requirements are clear from task definition.

---

## Checklist

- [ ] Create `require-admin.ts` middleware
- [ ] Export from `middleware/index.ts`
- [ ] Create `routes/admin/credit-packages.ts`
- [ ] Create `routes/admin/index.ts`
- [ ] Wire in `index.ts`
- [ ] Write unit tests
- [ ] Run build validation
- [ ] Run tests
