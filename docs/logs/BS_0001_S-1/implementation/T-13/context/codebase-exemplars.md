# Codebase Exemplars

Task: T-13 — Events API (CRUD + QR generation)
Root: BS_0001_S-1
Surface: API (Hono on Cloudflare Workers)
Date: 2026-01-10

## Primary Surface: API

Inferred from upstream context: T-13 requires implementing Events CRUD endpoints in `apps/api` with Hono framework.

---

## Exemplar 1: Admin Credit Packages CRUD (`apps/api/src/routes/admin/credit-packages.ts`)

**Why relevant:** Complete CRUD pattern with Zod validation, error responses, and database operations using Drizzle ORM.

**File path:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/apps/api/src/routes/admin/credit-packages.ts`

### Pattern to copy

```typescript
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, asc } from "drizzle-orm";
import { creditPackages } from "@sabaipics/db";
import { requireAdmin } from "../../middleware";
import type { Env } from "../../types";

// =============================================================================
// Validation Schemas
// =============================================================================

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

// =============================================================================
// Error Helpers
// =============================================================================

function validationError(message: string, details?: z.ZodIssue[]) {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message,
      ...(details && { details }),
    },
  };
}

function notFoundError(message: string) {
  return {
    error: {
      code: "NOT_FOUND",
      message,
    },
  };
}

// =============================================================================
// Routes
// =============================================================================

export const adminCreditPackagesRouter = new Hono<Env>()
  // GET / - List all
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
    const [created] = await db
      .insert(creditPackages)
      .values(data)
      .returning();
    return c.json({ data: created }, 201);
  })
  // PATCH /:id - Update
  .patch(
    "/:id",
    requireAdmin(),
    zValidator("json", updatePackageSchema),
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const data = c.req.valid("json");
      const db = c.var.db();

      const [existing] = await db
        .select({ id: creditPackages.id })
        .from(creditPackages)
        .where(eq(creditPackages.id, id))
        .limit(1);

      if (!existing) {
        return c.json(notFoundError("Credit package not found"), 404);
      }

      const [updated] = await db
        .update(creditPackages)
        .set(data)
        .where(eq(creditPackages.id, id))
        .returning();

      return c.json({ data: updated });
    }
  );
```

### Key takeaways for T-13

1. **Validation at route boundary** using `@hono/zod-validator` with `zValidator("json", schema)` or `zValidator("param", schema)`
2. **Error response envelope:** `{ error: { code: string, message: string } }`
3. **Success response envelope:** `{ data: T }`
4. **DB access pattern:** `c.var.db()` returns the database instance
5. **Middleware chain:** Auth middleware runs before route handler
6. **Existence check before update:** Query first, return 404 if not found
7. **Use `.returning()`** to get inserted/updated rows back

---

## Exemplar 2: Consent Routes (POST with business logic) (`apps/api/src/routes/consent.ts`)

**Why relevant:** Shows POST endpoint with conditional logic, multiple DB operations, and custom error codes.

**File path:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/apps/api/src/routes/consent.ts`

### Pattern to copy

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

// =============================================================================
// Error Helpers
// =============================================================================

function alreadyConsentedError() {
  return {
    error: {
      code: "ALREADY_CONSENTED",
      message: "PDPA consent already recorded",
    },
  };
}

// =============================================================================
// Routes
// =============================================================================

export const consentRouter = new Hono<Env>()
  // GET / - Check status
  .get("/", requirePhotographer(), (c) => {
    const photographer = c.var.photographer;
    return c.json({
      data: {
        isConsented: !!photographer.pdpaConsentAt,
        consentedAt: photographer.pdpaConsentAt,
      },
    });
  })
  // POST / - Record consent
  .post("/", requirePhotographer(), async (c) => {
    const photographer = c.var.photographer;

    // Business logic: check if already consented
    if (photographer.pdpaConsentAt) {
      return c.json(alreadyConsentedError(), 409);
    }

    const db = c.var.db();
    const ipAddress = c.req.header("CF-Connecting-IP") ?? null;
    const now = new Date().toISOString();

    // Insert consent record
    const [consentRecord] = await db
      .insert(consentRecords)
      .values({
        photographerId: photographer.id,
        consentType: "pdpa",
        ipAddress,
      })
      .returning({
        id: consentRecords.id,
        consentType: consentRecords.consentType,
        createdAt: consentRecords.createdAt,
      });

    // Update photographer (separate operation)
    await db
      .update(photographers)
      .set({ pdpaConsentAt: now })
      .where(eq(photographers.id, photographer.id));

    return c.json({ data: consentRecord }, 201);
  });
```

### Key takeaways for T-13

1. **Business logic validation before DB** (check state, return custom error code like `ALREADY_CONSENTED`)
2. **Multiple DB operations in single request** (insert + update)
3. **HTTP status codes:** 409 for conflict, 201 for created
4. **Reading headers:** `c.req.header("CF-Connecting-IP")`
5. **Timestamps:** Use `new Date().toISOString()` for consistent format
6. **Select specific columns with `.returning({ ... })`**

---

## Exemplar 3: Dashboard Route (Complex queries with aggregates) (`apps/api/src/routes/dashboard/route.ts`)

**Why relevant:** Shows complex SELECT queries with SQL aggregates, subqueries, and joins using Drizzle ORM.

**File path:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/apps/api/src/routes/dashboard/route.ts`

### Pattern to copy

```typescript
import { Hono } from "hono";
import { sql, eq, gt, and, desc } from "drizzle-orm";
import { creditLedger, events, photos } from "@sabaipics/db";
import { requirePhotographer, requireConsent, type PhotographerVariables } from "../../middleware";

export const dashboardRouter = new Hono<Env>()
  .get("/", requirePhotographer(), requireConsent(), async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.db();

    // Query with SQL aggregate
    const [balanceResult] = await db
      .select({
        balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int`,
      })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.photographerId, photographer.id),
          gt(creditLedger.expiresAt, sql`NOW()`)
        )
      );

    // Query with subquery for related counts
    const eventsWithCounts = await db
      .select({
        id: events.id,
        name: events.name,
        photoCount: sql<number>`COALESCE((
          SELECT COUNT(*)::int FROM ${photos} WHERE ${photos.eventId} = ${events.id}
        ), 0)`,
        faceCount: sql<number>`COALESCE((
          SELECT SUM(${photos.faceCount})::int FROM ${photos} WHERE ${photos.eventId} = ${events.id}
        ), 0)`,
      })
      .from(events)
      .where(eq(events.photographerId, photographer.id))
      .orderBy(desc(events.createdAt))
      .limit(10);

    return c.json({ data: { ... } });
  });
```

### Key takeaways for T-13

1. **SQL fragments with `sql` template tag** for aggregates (`SUM`, `COUNT`, `COALESCE`)
2. **Complex WHERE conditions** using `and()`, `or()`, `eq()`, `gt()`, etc.
3. **Subqueries** for related counts
4. **Ordering and pagination** with `.orderBy()` and `.limit()`
5. **Multiple sequential queries** to build composite response
6. **Typed SQL results** with `sql<Type>\`...\``

---

## Test Pattern Exemplar: Admin Credit Packages Tests (`apps/api/src/routes/admin/credit-packages.test.ts`)

**Why relevant:** Complete test pattern using Hono's `testClient` for type-safe API testing.

**File path:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/apps/api/src/routes/admin/credit-packages.test.ts`

### Pattern to copy

```typescript
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { adminCreditPackagesRouter } from "./credit-packages";
import type { Database } from "@sabaipics/db";

// =============================================================================
// Test Setup
// =============================================================================

const MOCK_UUID_1 = "11111111-1111-1111-1111-111111111111";
const TEST_API_KEY = "test-admin-key";

// Mock DB builder
function createMockDb(overrides = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(mockPackages),
    limit: vi.fn().mockResolvedValue([mockPackages[0]]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockPackages[0]]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    ...overrides,
  };
}

// Test app builder
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

// =============================================================================
// Tests
// =============================================================================

describe("POST /credit-packages", () => {
  it("creates package with all fields", async () => {
    const newPackage = { id: "pkg-new", name: "New Package", ... };
    const mockDb = createMockDb();
    mockDb.returning = vi.fn().mockResolvedValue([newPackage]);
    
    const app = createTestApp(mockDb);
    const client = testClient(app, { ADMIN_API_KEY: TEST_API_KEY });

    const res = await client["credit-packages"].$post(
      { json: { name: "New Package", credits: 200, priceThb: 499 } },
      { headers: { "X-Admin-API-Key": TEST_API_KEY } }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data).toEqual(newPackage);
    }
  });
});
```

### Key takeaways for T-13

1. **Use `testClient` from `hono/testing`** for type-safe tests
2. **Mock DB with vi.fn().mockReturnThis()** for method chaining
3. **Set environment variables** via second parameter to `testClient(app, env)`
4. **Set headers** via third parameter to `$method()` calls
5. **Type guard responses** with `if ("data" in body)` checks
6. **Test both success and error paths** (404, 400, etc.)

---

## Error Response Shape Pattern

From `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/packages/auth/src/errors.ts`:

```typescript
export const AUTH_ERRORS = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  // ...
} as const;

export function createAuthError(
  code: keyof typeof AUTH_ERRORS,
  message: string
): AuthErrorResponse {
  return { error: { code: AUTH_ERRORS[code], message } };
}
```

**Standard error shape:**
```typescript
{
  error: {
    code: "STRING_CODE",      // e.g., "NOT_FOUND", "VALIDATION_ERROR"
    message: "Human readable message"
  }
}
```

**Common error codes:**
- `UNAUTHENTICATED` - 401, missing/invalid auth
- `FORBIDDEN` - 403, auth but not allowed
- `NOT_FOUND` - 404, resource doesn't exist
- `VALIDATION_ERROR` - 400, invalid request body
- `ALREADY_CONSENTED` - 409, business logic conflict
- `INVALID_REQUEST` - 400, malformed request

---

## QR Generation Integration Pattern

From `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/apps/api/src/lib/qr/generate.ts`:

```typescript
import { generatePngQrCode } from "@juit/qrcode";

export async function generateEventQR(
  accessCode: string,
  baseUrl: string
): Promise<Uint8Array> {
  // Validate access code format
  if (!/^[A-Z0-9]{6}$/.test(accessCode)) {
    throw new Error(`Invalid access code format: "${accessCode}"`);
  }

  const searchUrl = `${baseUrl}/search/${accessCode}`;

  const pngBytes = await generatePngQrCode(searchUrl, {
    ecLevel: "M",  // Medium error correction
    margin: 4,     // Standard quiet zone
  });

  return pngBytes;
}
```

### R2 Upload Pattern (from T-1 knowledge)

```typescript
const qrPng = await generateEventQR(accessCode, c.env.APP_BASE_URL);
const r2Key = `qr/${eventId}.png`;
await c.env.PHOTOS_BUCKET.put(r2Key, qrPng);
// Store r2Key in database
```

---

## Middleware Patterns

### Photographer Auth (from `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/apps/api/src/middleware/require-photographer.ts`):

```typescript
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

### Type variables for photographer routes:

```typescript
type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;  // extends AuthVariables
};
```

---

## Database Schema Reference

From `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/packages/db/src/schema/events.ts`:

```typescript
export const events = pgTable("events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  photographerId: uuid("photographer_id")
    .notNull()
    .references(() => photographers.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  startDate: timestamptz("start_date"),
  endDate: timestamptz("end_date"),
  accessCode: text("access_code").notNull().unique(), // 6-char code
  qrCodeR2Key: text("qr_code_r2_key"), // R2 key for QR PNG
  rekognitionCollectionId: text("rekognition_collection_id"),
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: createdAtCol(),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
```

**For T-13:** Events API will need to:
- Generate 6-character uppercase access codes (A-Z0-9)
- Call `generateEventQR()` and upload to R2
- Store R2 key in `qrCodeR2Key` column

---

## Environment Variables (from `apps/api/src/types.ts`)

```typescript
export type Bindings = CloudflareBindings & {
  ADMIN_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  APP_BASE_URL: string;  // For QR code URLs
};
```

For T-13, `APP_BASE_URL` will be used in `generateEventQR()`.

---

## Summary: What to copy for T-13

1. **Route structure:** Copy from `credit-packages.ts` - GET list, POST create, PATCH update, GET by-id
2. **Validation:** Use `@hono/zod-validator` with Zod schemas for request bodies
3. **Error responses:** Use `{ error: { code, message } }` shape with helper functions
4. **Auth:** Chain `requirePhotographer()` and `requireConsent()` middleware for protected routes
5. **DB queries:** Use Drizzle ORM with `c.var.db()`, chain `.select().from().where()`
6. **QR generation:** Import `generateEventQR()` from `~/lib/qr`, pass `accessCode` and `c.env.APP_BASE_URL`
7. **R2 upload:** Use `await c.env.PHOTOS_BUCKET.put(key, data)` for QR PNG
8. **Tests:** Use `testClient` with mocked DB and environment variables
