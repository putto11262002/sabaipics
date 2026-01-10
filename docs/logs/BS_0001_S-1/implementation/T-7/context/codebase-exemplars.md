# Codebase Exemplars for T-7 (Dashboard API)

**Surface:** API  
**Task:** Dashboard API for photographer event management

---

## 1. Best Exemplars

### Exemplar 1: consent.ts - Authenticated Photographer Route

**File:** `/apps/api/src/routes/consent.ts`

**Pattern:**
- Uses `requirePhotographer()` middleware for Clerk-based auth
- Accesses authenticated photographer via `c.var.photographer`
- Uses `c.var.db()` for database access
- Follows consistent error response shape with `{ error: { code, message } }`
- Returns success data wrapped in `{ data: ... }`

```typescript
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { consentRecords, photographers } from "@sabaipics/db";
import { requirePhotographer, type PhotographerVariables } from "../middleware";
import type { Bindings } from "../types";

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

// Error helper pattern
function alreadyConsentedError() {
  return {
    error: {
      code: "ALREADY_CONSENTED",
      message: "PDPA consent already recorded",
    },
  };
}

export const consentRouter = new Hono<Env>()
  .post("/", requirePhotographer(), async (c) => {
    const photographer = c.var.photographer;  // From middleware
    const db = c.var.db();
    
    // Business logic...
    
    return c.json({ data: consentRecord }, 201);
  });
```

**Why it matters:** This is the exact pattern T-7 should follow for authenticated photographer routes. The `requirePhotographer()` middleware handles auth and populates `photographer` context.

---

### Exemplar 2: credit-packages.ts - CRUD with Zod Validation

**File:** `/apps/api/src/routes/admin/credit-packages.ts`

**Pattern:**
- Zod schemas for request validation
- Uses `zValidator("json", schema)` and `zValidator("param", schema)`
- GET/POST/PATCH CRUD operations
- Consistent error helpers: `validationError()`, `notFoundError()`
- Checks existence before update operations

```typescript
import { Hono } from "hono";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { creditPackages } from "@sabaipics/db";
import { requireAdmin } from "../../middleware";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../../types";

// Validation schemas
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
  // ... partial schema for updates
});

// Error helpers
function notFoundError(message: string) {
  return {
    error: {
      code: "NOT_FOUND",
      message,
    },
  };
}

export const adminCreditPackagesRouter = new Hono<Env>()
  // GET / - List
  .get("/", requireAdmin(), async (c) => {
    const db = c.var.db();
    const packages = await db
      .select()
      .from(creditPackages)
      .orderBy(asc(creditPackages.sortOrder));
    return c.json({ data: packages });
  })
  // POST / - Create
  .post("/", requireAdmin(), zValidator("json", createPackageSchema), async (c) => {
    const data = c.req.valid("json");
    const db = c.var.db();
    const [created] = await db.insert(creditPackages).values({...}).returning();
    return c.json({ data: created }, 201);
  })
  // PATCH /:id - Update
  .patch("/:id", requireAdmin(), 
    zValidator("json", updatePackageSchema),
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const data = c.req.valid("json");
      // Check existence first
      const [existing] = await db.select({id: table.id}).from(table).where(...).limit(1);
      if (!existing) return c.json(notFoundError("..."), 404);
      // Update
      const [updated] = await db.update(table).set(data).where(...).returning();
      return c.json({ data: updated });
    }
  );
```

**Why it matters:** Shows CRUD pattern with validation. T-7 events API will need similar GET (list), POST (create), PATCH (update) operations.

---

### Exemplar 3: require-photographer.ts - Authentication Middleware

**File:** `/apps/api/src/middleware/require-photographer.ts`

**Pattern:**
- Factory function returning `MiddlewareHandler`
- Checks Clerk auth from `c.get("auth")`
- Looks up photographer in DB by `clerkId`
- Returns structured auth errors
- Sets photographer context for downstream handlers

```typescript
import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { photographers } from "@sabaipics/db";
import { createAuthError } from "@sabaipics/auth/errors";
import type { AuthVariables } from "@sabaipics/auth/types";

export type PhotographerContext = Pick<Photographer, "id" | "pdpaConsentAt">;

export type PhotographerVariables = AuthVariables & {
  db: () => Database;
  photographer: PhotographerContext;
};

export function requirePhotographer(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth) {
      return c.json(createAuthError("UNAUTHENTICATED", "..."), 401);
    }

    const db = c.var.db();
    const [row] = await db
      .select({ id: photographers.id, pdpaConsentAt: photographers.pdpaConsentAt })
      .from(photographers)
      .where(eq(photographers.clerkId, auth.userId))
      .limit(1);

    if (!row) {
      return c.json(createAuthError("FORBIDDEN", "..."), 403);
    }

    c.set("photographer", row);
    return next();
  };
}
```

**Why it matters:** T-7 dashboard routes need photographer authentication. This middleware is ready to use.

---

## 2. Test Patterns

### File: `/apps/api/src/routes/consent.test.ts`

**Pattern:**
- Uses Vitest with `describe/it/expect`
- Uses Hono's `testClient` for type-safe API testing
- Creates mock DB with chainable methods
- Creates test app factory with dependency injection
- Separate test sections: Auth, Happy Path, Edge Cases

```typescript
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { consentRouter } from "./consent";
import type { Database } from "@sabaipics/db";
import type { PhotographerVariables } from "../middleware";

const MOCK_PHOTOGRAPHER_ID = "11111111-1111-1111-1111-111111111111";

// Mock DB factory
function createMockDb(overrides = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{...}]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    ...overrides,
  };
}

// Test app factory
function createTestApp(options: {
  mockDb?: ReturnType<typeof createMockDb>;
  photographer?: { id: string; pdpaConsentAt: string | null } | null;
  hasAuth?: boolean;
}) {
  const { mockDb = createMockDb(), photographer = {...}, hasAuth = true } = options;
  
  const app = new Hono<Env>()
    .use("/*", (c, next) => {
      if (hasAuth) c.set("auth", {...});
      return next();
    })
    .use("/*", (c, next) => {
      c.set("db", () => mockDb as unknown as Database);
      return next();
    })
    .route("/consent", consentRouter);
    
  return { app, mockDb };
}

// Auth tests
describe("POST /consent - Auth", () => {
  it("returns 401 without authentication", async () => {
    const { app } = createTestApp({ hasAuth: false });
    const client = testClient(app);
    const res = await client.consent.$post();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });
});

// Happy path tests
describe("POST /consent - Happy Path", () => {
  it("creates consent record and returns 201", async () => {
    const { app, mockDb } = createTestApp({});
    const client = testClient(app);
    const res = await client.consent.$post();
    expect(res.status).toBe(201);
    expect(mockDb.insert).toHaveBeenCalled();
  });
});
```

**Why it matters:** Follow this exact pattern for T-7 events API tests.

---

## 3. Error Response Shape Patterns

### Standard Error Shape

All API errors follow this shape:

```typescript
{
  error: {
    code: string,       // e.g., "NOT_FOUND", "UNAUTHENTICATED", "VALIDATION_ERROR"
    message: string,    // Human-readable message
    details?: any[]     // Optional - for validation errors (Zod issues)
  }
}
```

### Auth Errors (from @sabaipics/auth/errors)

```typescript
import { createAuthError } from "@sabaipics/auth/errors";

// 401 - Not authenticated
c.json(createAuthError("UNAUTHENTICATED", "Authentication required"), 401);

// 403 - Forbidden (authenticated but not authorized)
c.json(createAuthError("FORBIDDEN", "Not allowed"), 403);
```

### Domain Errors (inline helpers)

```typescript
// 404 - Not found
function notFoundError(message: string) {
  return { error: { code: "NOT_FOUND", message } };
}
return c.json(notFoundError("Event not found"), 404);

// 409 - Conflict
function alreadyExistsError() {
  return { error: { code: "ALREADY_EXISTS", message: "Resource already exists" } };
}
return c.json(alreadyExistsError(), 409);

// 400 - Validation error
function validationError(message: string, details?: z.ZodIssue[]) {
  return { error: { code: "VALIDATION_ERROR", message, ...(details && { details }) } };
}
return c.json(validationError("Invalid input", zodResult.error.issues), 400);
```

### Success Response Shape

```typescript
// Single item
{ data: { id: "...", name: "...", ... } }

// List
{ data: [ {...}, {...} ] }

// With status codes:
// 200 - OK (GET, PATCH)
// 201 - Created (POST)
// 204 - No Content (DELETE) - optional
```

---

## 4. Anti-Patterns to Avoid

### DO NOT:

1. **Break the Hono chain** - Always use method chaining for type inference:
   ```typescript
   // BAD
   const router = new Hono();
   router.get("/", ...);
   router.post("/", ...);
   
   // GOOD
   const router = new Hono()
     .get("/", ...)
     .post("/", ...);
   ```

2. **Throw untyped errors** - Always return structured error responses:
   ```typescript
   // BAD
   throw new Error("Not found");
   
   // GOOD
   return c.json(notFoundError("Event not found"), 404);
   ```

3. **Skip ownership checks** - Dashboard routes must filter by photographer:
   ```typescript
   // BAD - returns all events
   const events = await db.select().from(events);
   
   // GOOD - scoped to photographer
   const events = await db.select().from(events)
     .where(eq(events.photographerId, photographer.id));
   ```

4. **Forget validation on mutations** - Always validate input:
   ```typescript
   // BAD
   .post("/", async (c) => {
     const data = await c.req.json();  // Unvalidated!
   
   // GOOD
   .post("/", zValidator("json", createEventSchema), async (c) => {
     const data = c.req.valid("json");  // Typed and validated
   ```

5. **Inconsistent status codes**:
   - `200` for successful GET/PATCH
   - `201` for successful POST (create)
   - `401` for unauthenticated
   - `403` for forbidden
   - `404` for not found
   - `409` for conflict/duplicate

---

## 5. Route Registration Pattern

Routes are registered in `/apps/api/src/index.ts`:

```typescript
// In index.ts - add new routes to the chain
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  // ... existing middleware and routes ...
  .route("/consent", consentRouter)
  .route("/dashboard/events", dashboardEventsRouter);  // NEW

export type AppType = typeof app;  // Exports types for RPC client
```

**Note:** Dashboard routes should be placed AFTER `createClerkAuth()` middleware to get auth context.

---

## 6. Database Query Patterns

### Select with filter and ordering

```typescript
const events = await db
  .select()
  .from(events)
  .where(eq(events.photographerId, photographer.id))
  .orderBy(desc(events.createdAt));
```

### Insert and return created row

```typescript
const [created] = await db
  .insert(events)
  .values({
    photographerId: photographer.id,
    name: data.name,
    // ...
  })
  .returning();
```

### Update with ownership check

```typescript
const [updated] = await db
  .update(events)
  .set({ name: data.name })
  .where(
    and(
      eq(events.id, id),
      eq(events.photographerId, photographer.id)  // Ownership check!
    )
  )
  .returning();
```

---

## Summary

For T-7 Dashboard API implementation:

1. **Copy structure from:** `consent.ts` (auth pattern) + `credit-packages.ts` (CRUD pattern)
2. **Use middleware:** `requirePhotographer()` for authentication
3. **Use Zod:** Define schemas for create/update operations
4. **Scope by photographer:** All queries must filter by `photographerId`
5. **Test pattern:** Use `testClient`, mock DB, test auth + happy path + edge cases
6. **Error shape:** `{ error: { code, message } }` with appropriate status codes
