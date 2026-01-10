# Codebase Exemplars: T-8

## Surface: API

### GET endpoint exemplars

#### 1. `apps/api/src/routes/db-test.ts` — Simple public GET endpoint
**Purpose:** Database connectivity test endpoint (no auth required)

**Pattern:**
```typescript
import { Hono } from "hono";
import { createDb } from "@sabaipics/db/client";
import { dbTest } from "@sabaipics/db/schema";

type Bindings = {
  DATABASE_URL: string;
};

export const dbTestRouter = new Hono<{ Bindings: Bindings }>()
  .get("/", async (c) => {
    try {
      const db = createDb(c.env.DATABASE_URL);
      const results = await db.select().from(dbTest);

      return c.json({
        success: true,
        message: "Database connection successful",
        rowCount: results.length,
        data: results,
      });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }, 500);
    }
  });
```

**Key aspects:**
- Uses `Hono` with typed `Bindings` (env vars)
- Gets DB via `c.var.db()` or `createDb(c.env.DATABASE_URL)`
- Returns structured response with `c.json()`
- Wraps in try/catch for error handling
- Returns HTTP status codes (200, 500)

---

#### 2. `apps/api/src/routes/admin/credit-packages.ts` — Admin GET with auth
**Purpose:** List all credit packages (admin-only, API key auth)

**Pattern:**
```typescript
import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { creditPackages } from "@sabaipics/db";
import { requireAdmin } from "../../middleware";
import type { Env } from "../../types";

export const adminCreditPackagesRouter = new Hono<Env>()
  // GET / - List all packages
  .get("/", requireAdmin(), async (c) => {
    const db = c.var.db();
    const packages = await db
      .select()
      .from(creditPackages)
      .orderBy(asc(creditPackages.sortOrder));

    return c.json({ data: packages });
  })
```

**Key aspects:**
- Uses middleware (`requireAdmin()`) for authentication
- Accesses DB via `c.var.db()` (injected by middleware chain)
- Orders results with Drizzle ORM's `.orderBy()`
- Returns data wrapped in `{ data: ... }` envelope
- Uses `Env` type alias combining `Bindings` and `Variables`

---

#### 3. `apps/api/src/routes/auth.ts` — GET with Clerk auth
**Purpose:** Get current user info (Clerk JWT auth)

**Pattern:**
```typescript
import { Hono } from "hono";
import { requireAuth } from "@sabaipics/auth/middleware";
import type { AuthBindings, AuthVariables } from "@sabaipics/auth/types";

type Env = { Bindings: AuthBindings; Variables: AuthVariables };

export const authRouter = new Hono<Env>()
  .get("/profile", requireAuth(), (c) => {
    const auth = c.get("auth");
    return c.json({
      message: "This is a protected route",
      user: {
        userId: auth?.userId,
        sessionId: auth?.sessionId,
      },
      timestamp: Date.now(),
    });
  });
```

**Key aspects:**
- Uses `requireAuth()` middleware from `@sabaipics/auth/middleware`
- Accesses auth context via `c.get("auth")`
- Typed with `AuthBindings` and `AuthVariables`

---

### Credit/package-related code

#### Schema: `packages/db/src/schema/credit-packages.ts`
```typescript
export const creditPackages = pgTable("credit_packages", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  credits: integer("credits").notNull(),
  priceThb: integer("price_thb").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAtCol(),
});

export type CreditPackage = typeof creditPackages.$inferSelect;
export type NewCreditPackage = typeof creditPackages.$inferInsert;
```

**Key aspects:**
- Uses Drizzle ORM `pgTable`
- Has `active` flag for filtering (only return `active: true` for public endpoint)
- Has `sortOrder` for ordering
- Exports inferred TypeScript types

---

### Test exemplars

#### `apps/api/src/routes/admin/credit-packages.test.ts` — Pattern for GET tests
```typescript
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { adminCreditPackagesRouter } from "./credit-packages";
import type { Database } from "@sabaipics/db";

// Mock data with valid UUIDs
const MOCK_UUID_1 = "11111111-1111-1111-1111-111111111111";
const mockPackages = [
  {
    id: MOCK_UUID_1,
    name: "Basic",
    credits: 100,
    priceThb: 299,
    active: true,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

// Create mock DB
function createMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(mockPackages),
  };
}

// Create test app with mock DB
function createTestApp(mockDb = createMockDb()) {
  type Env = {
    Bindings: { ADMIN_API_KEY: string };
    Variables: { db: () => Database };
  };

  return new Hono<Env>()
    .use("/*", (c, next) => {
      c.set("db", () => mockDb as unknown as Database);
      return next();
    })
    .route("/credit-packages", adminCreditPackagesRouter);
}

// Test case
describe("GET /credit-packages", () => {
  it("returns all packages ordered by sortOrder", async () => {
    const mockDb = createMockDb();
    const app = createTestApp(mockDb);
    const client = testClient(app, { ADMIN_API_KEY: "test-key" });

    const res = await client["credit-packages"].$get(undefined, {
      headers: { "X-Admin-API-Key": "test-key" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data).toEqual(mockPackages);
    } else {
      throw new Error("Expected data response");
    }
  });
});
```

**Key aspects:**
- Uses `vitest` for testing
- Uses Hono's `testClient` for type-safe API calls
- Mocks DB with vi.fn() chain for Drizzle ORM
- Tests both success and error paths
- Validates response shape with type guards (`if ("data" in body)`)

---

### Test exemplar for public endpoint (no auth)

#### `apps/api/src/routes/consent.test.ts` — Pattern for testing without auth
```typescript
describe("POST /consent - Auth", () => {
  it("returns 401 without authentication", async () => {
    const { app } = createTestApp({ hasAuth: false });
    const client = testClient(app);

    const res = await client.consent.$post();

    expect(res.status).toBe(401);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("UNAUTHENTICATED");
    } else {
      throw new Error("Expected error response");
    }
  });
});
```

**For public endpoints (T-8):**
- No auth headers needed
- Just call `client.packages.$get()` directly
- Test empty results, single result, multiple results

---

## Key patterns to follow for T-8

### Route definition
1. Create new router file: `apps/api/src/routes/packages.ts`
2. Export router: `export const packagesRouter = new Hono<Env>()`
3. Register in `apps/api/src/index.ts`:
   ```typescript
   .route("/packages", packagesRouter)  // Public, no auth
   ```
4. **Public routes go BEFORE Clerk auth middleware** (after CORS/DB injection)

### Validation
- **No validation needed for simple GET** (no request body)
- If adding query params (e.g., `?active=true`), use `zValidator`:
  ```typescript
  import { zValidator } from "@hono/zod-validator";
  import { z } from "zod";

  .get("/", zValidator("query", z.object({
    active: z.enum(["true", "false"]).optional()
  })), async (c) => {
    const { active } = c.req.valid("query");
    // ...
  })
  ```

### Response shape
- **Success:** `{ data: [...] }` or `{ data: {...} }`
- **Error:** `{ error: { code: "ERROR_CODE", message: "..." } }`
- Use inferred types from schema:
  ```typescript
  import type { CreditPackage } from "@sabaipics/db";
  // Returns: { data: CreditPackage[] }
  ```

### Error handling
- Wrap DB calls in try/catch for unexpected errors
- Return appropriate status codes:
  - `200` — Success
  - `404` — Not found (for specific resource)
  - `500` — Server error

### DB query pattern (for T-8)
```typescript
import { eq, asc, and } from "drizzle-orm";
import { creditPackages } from "@sabaipics/db";

const db = c.var.db();
const packages = await db
  .select()
  .from(creditPackages)
  .where(eq(creditPackages.active, true))  // Only active packages
  .orderBy(asc(creditPackages.sortOrder));

return c.json({ data: packages });
```

### Type definitions
Use shared `Env` type from `apps/api/src/types.ts`:
```typescript
import type { Env } from "../../types";

export const packagesRouter = new Hono<Env>()
```

---

## Import patterns

| What you need | Import from |
|---------------|-------------|
| Hono framework | `"hono"` |
| DB client | `"@sabaipics/db"` |
| DB schema | `"@sabaipics/db"` |
| Drizzle ORM ops | `"drizzle-orm"` |
| Validation | `"@hono/zod-validator"`, `"zod"` |
| Types | `"../../types"` |
| Auth middleware | `"../../middleware"` (for protected routes) |

**Note:** `@sabaipics/db` re-exports everything from `./client` and `./schema`, so you can import schema and types from the same package.
