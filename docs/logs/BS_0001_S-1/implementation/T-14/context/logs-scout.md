# Logs Scout Report

Task: T-14
Root: BS_0001_S-1
Date: 2026-01-10

## Established patterns (carry forward)

### API patterns

#### Route definition structure

- **Location:** `apps/api/src/routes/<resource>.ts`
- **Barrel export:** `apps/api/src/routes/index.ts` (if used)
- **Type definition pattern:**

  ```typescript
  type Env = {
    Bindings: Bindings;
    Variables: PhotographerVariables | WebhookVariables | {};
  };

  export const resourceRouter = new Hono<Env>().get('/', handler).post('/', handler);
  ```

#### Route registration order (apps/api/src/index.ts)

1. **Webhooks** - DB injection → webhook routes (no auth, no CORS)
2. **CORS** - Applied to all routes
3. **DB injection** - For non-webhook routes
4. **Admin routes** - API key auth (before Clerk)
5. **Public routes** - Before Clerk auth (e.g., `GET /credit-packages`)
6. **Clerk auth middleware** - `createClerkAuth()`
7. **Authenticated routes** - After Clerk auth

#### Middleware patterns

- **Location:** `apps/api/src/middleware/`
- **`requirePhotographer()`** - Verifies Clerk auth + photographer exists in DB
  - Returns 401 if no valid Clerk session
  - Returns 403 if photographer not found in DB
  - Sets `PhotographerContext: { id: string, pdpaConsentAt: string | null }`
- **`requireConsent()`** - Must run AFTER `requirePhotographer()`, checks `pdpaConsentAt` is not null
- **`requireAdmin()`** - Verifies `X-Admin-API-Key` header against `c.env.ADMIN_API_KEY`
- **DB access:** `c.var.db()` returns Drizzle database instance

#### Validation

- **Library:** `@hono/zod-validator` with Zod schemas
- **Pattern:**

  ```typescript
  import { zValidator } from "@hono/zod-validator";
  import { z } from "zod";

  const createSchema = z.object({
    field: z.string(),
    optional: z.string().optional(),
  });

  .post("/", zValidator("json", createSchema), async (c) => {
    const body = c.req.valid("json");
    // ...
  })
  ```

### Error handling

#### Status codes (established)

- **200** - Success (GET, PATCH)
- **201** - Created (POST)
- **400** - Validation error
- **401** - Unauthenticated (no valid Clerk session)
- **403** - Forbidden (photographer not found or no consent)
- **404** - Not found
- **409** - Conflict (already exists, idempotent operations)
- **500** - Internal server error

#### Error response shape

```typescript
// Auth errors (from @sabaipics/auth/errors)
{
  error: {
    code: "UNAUTHENTICATED" | "FORBIDDEN",
    message: "Human readable message"
  }
}

// Business logic errors
{
  error: {
    code: "NOT_FOUND" | "ALREADY_CONSENTED" | "VALIDATION_ERROR",
    message: "Human readable message",
    details?: [...] // optional for validation errors
  }
}
```

#### Success response shape

```typescript
// Single resource
{ data: { ...resource } }

// List of resources
{ data: [...resources] }
```

### Validation

#### Hono testClient pattern (from T-3, T-5, T-8)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { testClient } from 'hono/testing';
import { resourceRouter } from './resource';
import type { Database } from '@sabaipics/db';

// Mock DB builder
function createMockDb(overrides = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// Test app builder
function createTestApp(options: { mockDb?: ReturnType<typeof createMockDb> }) {
  const { mockDb = createMockDb() } = options;

  const app = new Hono()
    .use('/*', (c, next) => {
      c.set('db', () => mockDb as unknown as Database);
      return next();
    })
    .route('/resource', resourceRouter);

  return { app, mockDb };
}

describe('GET /resource', () => {
  it('returns expected data', async () => {
    const { app } = createTestApp({});
    const client = testClient(app);

    const res = await client.resource.$get();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
  });
});
```

#### Test coverage checklist

- Auth middleware tests (401, 403)
- Happy path (200/201)
- Validation errors (400)
- Not found (404)
- Conflict/idempotency (409)
- Response shape validation

### Testing

#### Commands

- `pnpm check-types` - TypeScript type checking
- `pnpm --filter=@sabaipics/api test` - Run API tests
- `pnpm --filter=@sabaipics/api build` - Build API
- `pnpm build` - Build all packages

## Known limitations affecting this task

### T-14 specific context

- **Task:** QR code generation library
- **Type:** `scaffold` (infrastructure/library setup)
- **Surface:** `API`
- **Scope:** `apps/api/src/lib/qr/`
- **Dependencies:** None (can be implemented in parallel)
- **Consumer:** T-13 (Events API) depends on T-14

### From prior tasks

1. **[T-1] R2 storage pattern** - Store `r2_key` (not URL) for resources
   - URLs can change (domain, CDN config)
   - Keys are immutable identifiers
   - Same key → multiple URL variants

2. **[T-4] Webhook idempotency** - Always check for existing records before insert

   ```typescript
   const [existing] = await db
     .select({ id: table.id })
     .from(table)
     .where(eq(table.uniqueField, value))
     .limit(1);
   if (existing) return; // Skip
   ```

3. **[T-5] No transaction wrapping** - Accepted for MVP
   - Both operations should be idempotent-safe
   - Not applicable to T-14 (pure library function)

4. **[T-9] Stripe metadata pattern** - Pass all context needed for fulfillment
   ```typescript
   metadata: {
     photographer_id: string,
     package_id: string,
     package_name: string,
     credits: string
   }
   ```

## Relevant follow-ups from prior work

### Follow-ups that MAY impact T-14

1. **[T-5] PM_FOLLOWUP** - PDPA consent copy needs review before launch
   - **Impact:** None (T-14 is QR generation library)

2. **[T-6] ENG_DEBT** - Add UI tests for consent flow
   - **Impact:** None (T-14 is API-side)

3. **[T-6] PM_FOLLOWUP** - Verify Clerk session lifetime is configured for 24h
   - **Impact:** None (T-14 is library code)

4. **[T-9] ENG_DEBT** - T-10: Implement webhook fulfillment handler
   - **Impact:** None (T-14 is independent)

5. **[T-9] PM_FOLLOWUP** - T-12: Implement success/cancel page UI
   - **Impact:** None (T-14 is API-side)

6. **[T-9] ENG_DEBT** - Add unit tests for checkout endpoint
   - **Impact:** None (T-14 is independent)

### No direct follow-ups impact T-14

- T-14 is a foundational library with no upstream debt
- T-13 (Events API) will consume T-14's output

## Ops conventions

### Env vars (from prior tasks)

- `DATABASE_URL` - Postgres connection string
- `ADMIN_API_KEY` - Admin API authentication
- `CLERK_PUBLISHABLE_KEY` - Clerk frontend key
- `CLERK_SECRET_KEY` - Clerk backend key
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook verification
- `CORS_ORIGIN` - Frontend origin for CORS and redirects

### Feature flags

- None established yet

### Migrations

- **Tool:** Drizzle ORM
- **Location:** `packages/db/drizzle/`
- **Generation:** `pnpm --filter=@sabaipics/db db:generate`
- **Apply:** `pnpm --filter=@sabaipics/db db:push`
- **Pattern:** Auto-generated SQL migrations with sequential naming

### Cloudflare Workers specifics

1. **Environment compatibility** - All libraries must work in Workers runtime
2. **No Node.js APIs** - Cannot use `fs`, `path`, etc. unless polyfilled
3. **Binary data** - Use `Uint8Array` instead of Node.js `Buffer`
4. **Wrangler config** - `apps/api/wrangler.jsonc`

## T-14 implementation notes

### Requirements from task spec

1. Add `@juit/qrcode` package
2. Create wrapper function `generateEventQR(accessCode)`
3. Return PNG as `Uint8Array` (not Node.js Buffer)
4. QR contains both search and slideshow URLs
5. Must work in Cloudflare Workers environment

### Expected output for T-13 consumption

```typescript
// apps/api/src/lib/qr/index.ts or generate.ts
export async function generateEventQR(accessCode: string): Promise<Uint8Array> {
  // Generate QR PNG with two URLs:
  // 1. Search URL: ${FRONTEND_URL}/search/${accessCode}
  // 2. Slideshow URL: ${FRONTEND_URL}/slideshow/${accessCode}
  // Returns PNG as Uint8Array for R2 upload
}
```

### Testing strategy

- Unit test QR generation function
- Verify output is valid PNG (check magic bytes)
- Verify QR is scannable (can decode the embedded URLs)
- Test in Workers environment (not just Node.js)

### No database access needed

- T-14 is pure library code
- No middleware, no routes, no DB access
- Just export the function for T-13 to import

### No migration needed

- No schema changes
- No new tables
- T-14 is pure compute logic
