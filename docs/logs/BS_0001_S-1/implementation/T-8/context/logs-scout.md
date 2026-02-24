# Logs Scout: T-8

## Relevant prior implementations

### T-3: Admin Credit Packages API

- **Relevance:** Direct precedent - same `credit_packages` table, similar query patterns
- **Key files:** `apps/api/src/routes/admin/credit-packages.ts`, `apps/api/src/routes/admin/credit-packages.test.ts`
- **Takeaways:** GET endpoint pattern, ordering by `sortOrder`, response shape

### T-5: PDPA Consent API

- **Relevance:** Public-facing GET/POST pattern, no admin auth required
- **Key files:** `apps/api/src/routes/consent.ts`, `apps/api/src/routes/consent.test.ts`
- **Takeaways:** `requirePhotographer` middleware usage, response envelope shape, testing patterns

### T-2: requirePhotographer Middleware

- **Relevance:** Auth middleware pattern for protected routes
- **Key files:** `apps/api/src/middleware/require-photographer.ts`, `apps/api/src/middleware/index.ts`

---

## Carry-forward patterns

### API endpoints

#### Route definition pattern

```typescript
// File location: apps/api/src/routes/<resource>.ts
import { Hono } from 'hono';
import { eq, asc } from 'drizzle-orm';
import { creditPackages } from '@sabaipics/db';
import { requirePhotographer, type PhotographerVariables } from '../middleware';
import type { Bindings } from '../types';

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

export const creditsRouter = new Hono<Env>().get('/', requirePhotographer(), async (c) => {
  // handler implementation
});
```

#### Route registration

```typescript
// apps/api/src/index.ts
import { creditsRouter } from "./routes/credits";

// Register after Clerk auth, before other protected routes
.route("/credits", creditsRouter)
```

#### Validation

- **For public GET endpoints (like T-8):** No request body validation needed
- **Zod validation pattern** (from T-3) for reference:

  ```typescript
  import { zValidator } from "@hono/zod-validator";
  import { z } from "zod";

  const uuidSchema = z.string().uuid();

  // Usage in route
  .get("/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");
      // ...
    }
  )
  ```

#### Error handling

```typescript
// Error helper functions (inline, not centralized yet)
function notFoundError(message: string) {
  return {
    error: {
      code: 'NOT_FOUND',
      message,
    },
  };
}

// Usage
return c.json(notFoundError('Credit package not found'), 404);
```

**Auth errors** use `createAuthError` from `@sabaipics/auth/errors`:

```typescript
import { createAuthError } from '@sabaipics/auth/errors';

// UNAUTHENTICATED (401) - No valid Clerk session
// FORBIDDEN (403) - Photographer not found or other access denied
```

#### DB access pattern

```typescript
// DB is injected via middleware, accessed via c.var.db()
const db = c.var.db();

// Query pattern (from T-3)
const packages = await db.select().from(creditPackages).orderBy(asc(creditPackages.sortOrder));

// Filter pattern (for active only)
import { eq, and, asc } from 'drizzle-orm';

const activePackages = await db
  .select()
  .from(creditPackages)
  .where(eq(creditPackages.active, true))
  .orderBy(asc(creditPackages.sortOrder));
```

### Response shapes

#### Success response (single item)

```typescript
// Created resource (201)
return c.json({ data: created }, 201);

// Updated resource (200)
return c.json({ data: updated });

// Retrieved resource (200)
return c.json({ data: resource });
```

#### Success response (list)

```typescript
// List (200)
return c.json({ data: packages });
```

#### Error response

```typescript
// Auth errors (from middleware)
{
  error: {
    code: "UNAUTHENTICATED" | "FORBIDDEN",
    message: "..."
  }
}

// Business logic errors
{
  error: {
    code: "NOT_FOUND" | "ALREADY_CONSENTED" | "VALIDATION_ERROR",
    message: "...",
    details?: [...] // optional for validation errors
  }
}
```

### Testing

#### Test setup pattern (from T-5)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { testClient } from 'hono/testing';
import { creditsRouter } from './credits';
import type { Database } from '@sabaipics/db';
import type { PhotographerVariables } from '../middleware';

// Mock constants
const MOCK_PHOTOGRAPHER_ID = '11111111-1111-1111-1111-111111111111';
const MOCK_CLERK_ID = 'clerk_123';

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

  type Env = {
    Bindings: Record<string, unknown>;
    Variables: PhotographerVariables;
  };

  const app = new Hono<Env>()
    .use('/*', (c, next) => {
      c.set('auth', { userId: MOCK_CLERK_ID });
      return next();
    })
    .use('/*', (c, next) => {
      c.set('db', () => mockDb as unknown as Database);
      return next();
    })
    .route('/credits', creditsRouter);

  return { app, mockDb };
}
```

#### Test pattern

```typescript
describe('GET /credit-packages', () => {
  it('returns active packages sorted by sortOrder', async () => {
    const { app } = createTestApp({});
    const client = testClient(app);

    const res = await client.creditPackages.$get();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    // Add assertions for filtering and sorting
  });
});
```

#### Test coverage checklist

- **Auth tests:** 401 without auth, 403 without photographer
- **Happy path:** Returns expected data
- **Filtering:** Only `active: true` packages returned
- **Sorting:** Ordered by `sortOrder` ascending
- **Response shape:** Validates `{ data: [...] }` envelope

---

## Known debt / limitations affecting T-8

### From T-5

- `[KNOWN_LIMITATION]` No transaction wrapping for multi-step DB operations (not applicable to T-8 read-only endpoint)

### From T-3

- Admin API uses simple API key auth (`X-Admin-API-Key` header) - acceptable for MVP
- No pagination on list endpoints (acceptable for small datasets like credit packages)

### From T-1

- IDs use native Postgres `uuid` type (not `text`) - import `eq` from `drizzle-orm` for UUID comparisons
- Timestamps use `timestamp({ mode: "string", withTimezone: true })` - returned as ISO 8601 strings

### From T-2

- `requirePhotographer` middleware sets minimal context: `{ id, pdpaConsentAt }`
- Use `c.var.photographer.id` for queries, not `c.var.auth.userId`

---

## Schema reference for T-8

From `packages/db/src/schema/credit-packages.ts`:

```typescript
export const creditPackages = pgTable('credit_packages', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  credits: integer('credits').notNull(),
  priceThb: integer('price_thb').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow().notNull(),
});

export type CreditPackage = typeof creditPackages.$inferSelect;
```

**T-8 Acceptance:**

- Returns only `active: true` packages
- Sorted by `sortOrder` ascending
- Includes: `id`, `name`, `credits`, `priceThb`
- Optional: include `createdAt` if useful for UI

---

## File structure for T-8

```
apps/api/src/routes/
├── credits.ts           # NEW - GET /credit-packages endpoint
└── credits.test.ts      # NEW - Unit tests

apps/api/src/
└── index.ts             # MODIFY - Register creditsRouter
```
