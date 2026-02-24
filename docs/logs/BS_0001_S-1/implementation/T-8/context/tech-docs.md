# Tech Docs + Repo Rules: T-8

## Stack choices

### API Framework/Runtime

- **Framework:** Hono ^4.10.7
- **Runtime:** Cloudflare Workers (compatibility_date: 2025-12-06)
- **CLI:** Wrangler ^4.20.0

### Validation

- **Library:** Zod ^3.24.0
- **Integration:** `@hono/zod-validator` ^0.7.6

### Database

- **ORM:** Drizzle ORM ^0.45.0
- **Driver:** @neondatabase/serverless ^1.0.2
- **Database:** Neon Postgres (serverless)

### Testing

- **Framework:** Vitest ^3.2.0
- **Workers Testing:** @cloudflare/vitest-pool-workers ^0.10.14
- **Mocking:** Vitest built-in vi, Hono testClient

## API conventions

### Route pattern

- Routes defined in `apps/api/src/routes/`
- Use Hono router with method chaining
- Export router from dedicated file (e.g., `export const creditsRouter`)
- Mount in main app via `.route("/credits", creditsRouter)`

### Request/response shape

- **Success responses:** `{ data: <payload> }`
- **Error responses:** `{ error: { code: <CODE>, message: <string>, ...details } }`
- **Status codes:**
  - 200: Successful GET
  - 201: Successful POST
  - 400: Validation error
  - 401: Unauthenticated
  - 403: Forbidden
  - 404: Not found
  - 409: Conflict (e.g., already consented)

### Validation

- Use `zValidator` middleware from `@hono/zod-validator`
- Validate both JSON body and URL params
- Example:

  ```typescript
  import { zValidator } from "@hono/zod-validator";
  import { z } from "zod";

  const schema = z.object({
    name: z.string().min(1).max(100),
    credits: z.number().int().positive(),
  });

  .post("/", requirePhotographer(), zValidator("json", schema), async (c) => {
    const data = c.req.valid("json");
    // ...
  })
  ```

### Error contract

- Define error helper functions per route file
- Standard shape:

  ```typescript
  function notFoundError(message: string) {
    return {
      error: {
        code: 'NOT_FOUND',
        message,
      },
    };
  }

  function validationError(message: string, details?: z.ZodIssue[]) {
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message,
        ...(details && { details }),
      },
    };
  }
  ```

### Authentication

- Clerk authentication via `@sabaipics/auth/middleware`
- For photographer routes: `requirePhotographer()` middleware
- Auth context injected into `c.var.auth` with `{ userId, sessionId }`
- Photographer context injected into `c.var.photographer` after lookup

### Environment types

```typescript
// apps/api/src/types.ts
export type Bindings = CloudflareBindings & {
  ADMIN_API_KEY: string;
  DATABASE_URL: string;
  CORS_ORIGIN: string;
  // ... other bindings
};

export type Variables = AuthVariables & {
  db: () => Database;
};

export type Env = { Bindings: Bindings; Variables: Variables };
```

## Data access conventions

### Database client injection

- DB client injected via middleware into `c.var.db`
- Usage: `const db = c.var.db();`
- Connection pooling handled by Neon serverless driver

### Drizzle ORM patterns

- Import tables from `@sabaipics/db`
- Use chainable query builder:

  ```typescript
  import { eq, asc, desc } from 'drizzle-orm';
  import { creditPackages } from '@sabaipics/db';

  // Select
  const packages = await db
    .select()
    .from(creditPackages)
    .where(eq(creditPackages.active, true))
    .orderBy(asc(creditPackages.sortOrder));

  // Insert with returning
  const [created] = await db.insert(creditPackages).values({ name, credits, priceThb }).returning();

  // Update
  const [updated] = await db
    .update(creditPackages)
    .set({ active: false })
    .where(eq(creditPackages.id, id))
    .returning();
  ```

### Transaction safety

- Drizzle handles transactions automatically for single operations
- For multi-step transactions, use `db.transaction()` (not needed for T-8)

## Testing conventions

### Test structure

- Co-located test files: `routes/credits.test.ts`
- Use Vitest `describe`, `it`, `expect`, `beforeEach`
- Mock DB with Vitest `vi.fn()`

### Test client pattern

```typescript
import { testClient } from 'hono/testing';
import { Hono } from 'hono';

// Create test app with mocked dependencies
const app = new Hono<Env>()
  .use('/*', (c, next) => {
    c.set('db', () => mockDb);
    return next();
  })
  .route('/credits', creditsRouter);

const client = testClient(app);

// Test
const res = await client.credit.$get();
expect(res.status).toBe(200);
```

### Mock DB pattern

```typescript
function createMockDb(overrides = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      // mock data
    ]),
    ...overrides,
  };
}
```

### Test categories

1. **Auth tests:** Verify unauthenticated requests return 401
2. **Validation tests:** Verify invalid input returns 400
3. **Happy path tests:** Verify success case works
4. **Edge cases:** Empty results, not found, etc.

## Security considerations

### Public endpoint

- T-8 (`GET /credit-packages`) is a **public** endpoint (no auth required)
- Does NOT need `requirePhotographer()` middleware
- Must be mounted BEFORE Clerk auth middleware in main app

### Data exposure

- Only return `active` packages
- Do NOT expose internal fields (e.g., sort_order if not needed by frontend)
- Price should be in THB (integer, no decimals)

### CORS

- CORS handled at app level via `cors()` middleware
- `CORS_ORIGIN` environment variable

## File locations

### Routes

- **New route file:** `apps/api/src/routes/credits.ts`
- **Mount location:** In `apps/api/src/index.ts` before auth middleware

### Schema

- Already defined in `packages/db/src/schema/credit-packages.ts`
- Import via: `import { creditPackages } from "@sabaipics/db";`

### Types

- App types: `apps/api/src/types.ts`
- Auth types: `packages/auth/src/types.ts`

## T-8 specific requirements

### Endpoint

```
GET /credit-packages
```

### Response shape

```typescript
{
  data: [
    {
      id: string;          // UUID
      name: string;        // Package name
      credits: number;     // Number of credits
      priceThb: number;    // Price in THB (integer)
    }
  ]
}
```

### Acceptance criteria

1. Returns only `active = true` packages
2. Sorted by `sort_order` ASC
3. No authentication required
4. Returns 200 with empty array if no active packages

### Dependencies

- `T-1`: Database schema (credit_packages table exists)
- `T-2`: Clerk integration (auth middleware exists, though not used for T-8)

## Example implementation pattern

```typescript
// apps/api/src/routes/credits.ts
import { Hono } from 'hono';
import { eq, asc } from 'drizzle-orm';
import { creditPackages } from '@sabaipics/db';
import type { Env } from '../types';

export const creditsRouter = new Hono<Env>()
  // GET / - List active credit packages
  .get('/', async (c) => {
    const db = c.var.db();
    const packages = await db
      .select({
        id: creditPackages.id,
        name: creditPackages.name,
        credits: creditPackages.credits,
        priceThb: creditPackages.priceThb,
      })
      .from(creditPackages)
      .where(eq(creditPackages.active, true))
      .orderBy(asc(creditPackages.sortOrder));

    return c.json({ data: packages });
  });
```

## References

- Architecture: `docs/tech/ARCHITECTURE.md`
- Tech stack: `docs/tech/TECH_STACK.md`
- Final plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Task definition: `docs/logs/BS_0001_S-1/tasks.md` (T-8)
- Admin credit packages example: `apps/api/src/routes/admin/credit-packages.ts`
- Consent route example (auth pattern): `apps/api/src/routes/consent.ts`
