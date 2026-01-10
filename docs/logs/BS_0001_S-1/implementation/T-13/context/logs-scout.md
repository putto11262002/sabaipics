# Implementation Logs Scout: T-13 Events API

**Root:** `BS_0001_S-1`
**Task:** `T-13` — Events API (Create, List, Update, Delete, QR code generation)
**Date:** 2026-01-10

---

## Overview

Scanned 11 prior implementation summaries to extract established patterns, conventions, and carry-forward constraints relevant to implementing the Events API.

---

## Established API Patterns

### 1. Route Structure and Organization

**Location:** `apps/api/src/routes/<router>.ts`

All route files follow this pattern:
```typescript
import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { requirePhotographer, requireConsent, type PhotographerVariables } from "../middleware";
import type { Bindings } from "../types";

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

export const routerName = new Hono<Env>()
  .get("/", handler)        // List/query
  .post("/", handler)       // Create
  .get("/:id", handler)     // Get single (optional)
  .patch("/:id", handler)   // Update (optional)
  .delete("/:id", handler); // Delete (optional)
```

**Registration in `apps/api/src/index.ts`:**
- Routes registered AFTER Clerk auth middleware (line 58) for protected endpoints
- Public routes registered BEFORE Clerk middleware (e.g., `/credit-packages`)
- Order: webhooks → CORS → DB injection → admin → public → Clerk auth → protected

```typescript
// Protected routes pattern (from T-7 dashboard, T-5 consent)
.use("/*", createClerkAuth())
.route("/dashboard", dashboardRouter)
.route("/consent", consentRouter)
```

### 2. Auth Middleware Chain

**Protected endpoints** (requires photographer + consent):
```typescript
import { requirePhotographer, requireConsent } from "../middleware";

router.post("/", requirePhotographer(), requireConsent(), async (c) => {
  const photographer = c.var.photographer; // { id, pdpaConsentAt }
  // ...
});
```

**Public endpoints** (no auth):
```typescript
// No middleware applied
router.get("/", async (c) => {
  // ...
});
```

**Middleware types:**
- `requirePhotographer()` — Validates Clerk auth, ensures photographer record exists, sets `c.var.photographer`
- `requireConsent()` — Checks `photographer.pdpaConsentAt` is not null (must run after requirePhotographer)
- `requireAdmin()` — API key auth via `X-Admin-API-Key` header (admin routes only)

### 3. Request/Response Patterns

**Response envelope (consistent across all APIs):**
```typescript
// Success response
return c.json({ data: { ... } }, 201);  // Created
return c.json({ data: [ ... ] }, 200);  // OK

// Error response
return c.json(
  {
    error: {
      code: "ERROR_CODE",
      message: "Human-readable description"
    }
  },
  400  // or 401, 403, 404, 409
);
```

**Common error codes:**
- `UNAUTHENTICATED` (401) — No valid Clerk session
- `FORBIDDEN` (403) — Authenticated but not authorized (no photographer record, no consent)
- `INVALID_REQUEST` (400) — Invalid input
- `NOT_FOUND` (404) — Resource not found
- `ALREADY_CONSENTED` (409) — Idempotency conflict (specific to consent)

### 4. Validation Patterns

**Manual validation** (from T-9 checkout):
```typescript
const body = await c.req.json();
const packageId = body?.packageId;

if (!packageId || typeof packageId !== "string") {
  return c.json(
    { error: { code: "INVALID_REQUEST", message: "packageId is required" } },
    400
  );
}
```

**Zod validation** (from T-3 admin):
```typescript
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const createPackageSchema = z.object({
  name: z.string(),
  credits: z.number(),
  priceThb: z.number(),
  active: z.boolean().optional().default(true),
  sortOrder: z.number().optional().default(0),
});

router.post("/", zValidator("json", createPackageSchema), async (c) => {
  const body = c.req.valid("json");
  // body is fully typed
});
```

**Recommendation for T-13:** Use Zod for event creation/update schemas (name, dates, etc.)

### 5. Database Query Patterns

**Using Drizzle ORM:**
```typescript
import { eq, asc, and } from "drizzle-orm";
import { events } from "@sabaipics/db";

// Single record
const [event] = await db
  .select()
  .from(events)
  .where(eq(events.id, eventId))
  .limit(1);

if (!event) {
  return c.json({ error: { code: "NOT_FOUND", message: "Event not found" } }, 404);
}

// List with filters
const eventsList = await db
  .select()
  .from(events)
  .where(eq(events.photographerId, photographer.id))
  .orderBy(asc(events.createdAt));

// Update
await db
  .update(events)
  .set({ name: "Updated Name" })
  .where(eq(events.id, eventId));

// Delete
await db
  .delete(events)
  .where(eq(events.id, eventId));
```

---

## Database Patterns (from T-1, T-9, T-10)

### Schema Conventions

**File location:** `packages/db/src/schema/events.ts` (already exists)

**Column types:**
```typescript
import { pgTable, text, uuid, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamptz, createdAtCol } from "./common";
import { photographers } from "./photographers";

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    photographerId: uuid("photographer_id")
      .notNull()
      .references(() => photographers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    startDate: timestamptz("start_date"),  // Nullable
    endDate: timestamptz("end_date"),      // Nullable
    accessCode: text("access_code").notNull().unique(),
    qrCodeR2Key: text("qr_code_r2_key"),   // Nullable
    rekognitionCollectionId: text("rekognition_collection_id"), // Nullable
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: createdAtCol(),
  },
  (table) => [
    index("events_photographer_id_idx").on(table.photographerId),
    index("events_access_code_idx").on(table.accessCode),
  ]
);
```

**Key patterns:**
- Use native `uuid` type (not text)
- Use `timestamptz()` for timestamps (mode: "string")
- Use `createdAtCol()` helper for created_at columns
- Index on foreign keys and unique lookup columns
- FK cascade: `restrict` (prevent accidental deletion)

### Migration Pattern

**Generate migration:**
```bash
pnpm --filter=@sabaipics/db db:generate
```

**Run migration:**
```bash
pnpm --filter=@sabaipics/db db:push  # Local
# Or deploy via Wrangler for production
```

**T-13 note:** No schema changes required for Events API (table exists from T-1).

---

## Test Patterns (from T-3, T-5, T-7, T-8, T-10)

### Test File Structure

**Location:** `apps/api/src/routes/<router>.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { routerName } from "./router";
import type { Database } from "@sabaipics/db";
import type { PhotographerVariables } from "../middleware";
```

### Mock DB Pattern

```typescript
function createMockDb(overrides = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([...]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([...]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([...]),
    ...overrides,
  };
}
```

### Test App Setup

```typescript
function createTestApp({ mockDb, photographer, hasAuth }) {
  type Env = {
    Bindings: Record<string, unknown>;
    Variables: PhotographerVariables;
  };

  const app = new Hono<Env>()
    .use("/*", (c, next) => {
      if (hasAuth) c.set("auth", { userId: "clerk_123" });
      return next();
    })
    .use("/*", (c, next) => {
      c.set("db", () => mockDb as unknown as Database);
      return next();
    })
    .use("/*", (c, next) => {
      // Mock photographer lookup
      mockDb.limit = vi.fn().mockResolvedValue(photographer ? [photographer] : []);
      return next();
    })
    .route("/events", eventsRouter);

  return { app, mockDb };
}
```

### Test Categories

**1. Auth tests** (from T-5, T-7, T-9):
```typescript
describe("POST /events - Auth", () => {
  it("returns 401 without authentication");
  it("returns 403 when photographer not found");
  it("returns 403 without PDPA consent");
});
```

**2. Happy path tests:**
```typescript
describe("POST /events - Success", () => {
  it("creates event and returns 201");
  it("stores access_code and qr_code_r2_key");
  it("generates QR code using T-14 library");
});
```

**3. Validation tests:**
```typescript
describe("POST /events - Validation", () => {
  it("returns 400 for missing name");
  it("returns 400 for invalid date format");
  it("returns 400 for invalid expires_at");
});
```

**4. Idempotency/conflict tests:**
```typescript
describe("POST /events - Conflicts", () => {
  it("returns 409 for duplicate access_code");
});
```

**5. Authorization tests:**
```typescript
describe("DELETE /events/:id - Authorization", () => {
  it("returns 404 for events owned by other photographer");
  it("returns 403 when trying to delete expired event");
});
```

---

## Carry-Forward Constraints

### From T-14 (QR Code Library)

**QR generation API** (available for T-13):
```typescript
import { generateEventQR } from "../lib/qr";

// Generates QR code PNG for event access code
const qrPng = await generateEventQR(accessCode, env.APP_BASE_URL);
// Returns: Uint8Array (PNG bytes)
// Throws: if accessCode format is invalid (must be 6 uppercase alphanumeric)
```

**Integration pattern:**
```typescript
// In POST /events handler
const accessCode = generateAccessCode(); // Your generator
const qrPng = await generateEventQR(accessCode, env.APP_BASE_URL);

// Upload to R2
const r2Key = `qr/${eventId}.png`;
await env.PHOTOS_BUCKET.put(r2Key, qrPng, {
  httpMetadata: { contentType: "image/png" }
});

// Store R2 key in DB
await db.insert(events).values({
  ...eventData,
  accessCode,
  qrCodeR2Key: r2Key,
});
```

**Environment variable required:**
- `APP_BASE_URL` — Base URL for QR-encoded search URLs (already configured in wrangler.jsonc)

**Known limitations from T-14:**
- Scannability testing deferred to T-13 integration phase
- Manual testing with iPhone, LINE, Android needed before merge

### From T-9 (Stripe Checkout)

**R2 upload pattern** (reusable for QR codes):
```typescript
await env.PHOTOS_BUCKET.put(key, data, {
  httpMetadata: { contentType: "image/png" }
});
```

### From T-1 (Schema)

**Events table columns** (reference for API response shape):
```typescript
{
  id: string;                           // UUID
  photographerId: string;               // UUID (FK)
  name: string;                         // Required
  startDate: string | null;             // ISO 8601 timestamp
  endDate: string | null;               // ISO 8601 timestamp
  accessCode: string;                   // 6-char uppercase A-Z0-9, unique
  qrCodeR2Key: string | null;           // R2 storage key
  rekognitionCollectionId: string | null; // Created on first upload
  expiresAt: string;                    // ISO 8601 timestamp
  createdAt: string;                    // ISO 8601 timestamp
}
```

**Indexes available:**
- `events_photographer_id_idx` — For listing photographer's events
- `events_access_code_idx` — For QR code lookup (public search endpoint)

### From T-2 (Middleware)

**Photographer context** (available after `requirePhotographer()`):
```typescript
type PhotographerContext = {
  id: string;           // Use for FK queries and ownership checks
  pdpaConsentAt: string | null;
};
```

**Usage in handlers:**
```typescript
const photographer = c.var.photographer;

// Query only photographer's own events
.where(eq(events.photographerId, photographer.id))
```

---

## Known Limitations (Accepted in Prior Tasks)

### From T-7 (Dashboard API)
- **nearestExpiry calculation:** Uses simple MIN of purchase expires_at (not FIFO-aware)
  - Acceptable for dashboard display; credit consumption logic is separate

### From T-5 (Consent API)
- **No transaction wrapping:** Consent record insert + photographer update are separate
  - Acceptable for MVP (both operations are idempotent-safe)

### From T-10 (Stripe Webhook)
- **PromptPay not handled:** `checkout.session.async_payment_succeeded` not implemented
  - Out of scope for MVP

### From T-14 (QR Library)
- **Scannability not auto-tested:** Manual verification required
  - Must test with iPhone, LINE in-app, Android before T-13 merge

---

## Follow-Ups That May Impact T-13

### From T-11 (Dashboard UI)
- **Create Event button** is disabled with tooltip "Event creation coming soon"
  - T-13 should enable this by implementing the API endpoint

### From T-14 (QR Library)
- **Manual scannability testing** required during T-13
  - Before merge: Test with iPhone camera, LINE in-app scanner, Android Chrome
  - Acceptable if 2 out of 3 device types scan successfully

### From T-9 (Stripe Checkout)
- **Success/cancel URLs** point to `/credits/success` and `/credits/packages`
  - T-13 events list should link to T-15 event detail page (future task)

---

## Recommendations for T-13 Implementation

### 1. Route Design

**POST /events** — Create event
- Auth: `requirePhotographer()` + `requireConsent()`
- Body: `{ name, startDate?, endDate?, expiresAt }`
- Steps:
  1. Validate request (Zod recommended)
  2. Generate unique 6-char access code (retry on collision)
  3. Generate QR code using `generateEventQR()` from T-14
  4. Upload QR to R2
  5. Insert event record
  6. Return 201 with event data

**GET /events** — List photographer's events
- Auth: `requirePhotographer()` + `requireConsent()`
- Query: Order by createdAt desc, limit 50
- Response: `{ data: [...] }`

**GET /events/:id** — Get single event
- Auth: `requirePhotographer()` + `requireConsent()`
- Authorization: Must own event (404 if other photographer's event)
- Response: `{ data: {...} }`

**PATCH /events/:id** — Update event
- Auth: `requirePhotographer()` + `requireConsent()`
- Authorization: Must own event
- Validation: Cannot change accessCode, photographerId, createdAt
- Allow updates: name, startDate, endDate, expiresAt

**DELETE /events/:id** — Delete event
- Auth: `requirePhotographer()` + `requireConsent()`
- Authorization: Must own event
- Constraint: Cannot delete if photos exist (FK restrict will handle this)
- Return 204 on success

### 2. Access Code Generation

**Pattern from T-14 validation:**
```typescript
function generateAccessCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No ambiguous chars (I, O, 0, 1)
  let code;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
    attempts++;
  } while (await accessCodeExists(code) && attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    throw new Error("Failed to generate unique access code");
  }

  return code;
}

async function accessCodeExists(code: string): Promise<boolean> {
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.accessCode, code))
    .limit(1);
  return !!event;
}
```

### 3. QR Code Integration

**Using T-14 library:**
```typescript
import { generateEventQR } from "../lib/qr";
import type { R2Bucket } from "@cloudflare/workers-types";

// In POST /events handler
const accessCode = generateAccessCode();
const qrPng = await generateEventQR(accessCode, env.APP_BASE_URL);

// Upload to R2
const r2Key = `qr/${eventId}.png`;
await env.PHOTOS_BUCKET.put(r2Key, qrPng, {
  httpMetadata: { contentType: "image/png" }
});

// eventId is available from insert returning
const [event] = await db.insert(events).values({...}).returning();
```

### 4. Error Handling

**Use established error shapes:**
```typescript
function eventNotFoundError() {
  return {
    error: {
      code: "NOT_FOUND",
      message: "Event not found",
    },
  };
}

function accessCodeConflictError() {
  return {
    error: {
      code: "ACCESS_CODE_CONFLICT",
      message: "Failed to generate unique access code",
    },
  };
}
```

### 5. Test Coverage

**Minimum test categories:**
1. Auth tests (401, 403)
2. Validation tests (400)
3. Happy path (201, 200)
4. Authorization (ownership checks)
5. Idempotency (access code generation retry)
6. QR integration (mock R2 upload)

---

## Summary of Key Patterns

| Pattern | Source | Apply to T-13? |
|---------|--------|----------------|
| Hono router structure | T-3, T-5, T-7, T-8, T-9 | Yes |
| requirePhotographer + requireConsent chain | T-2, T-5, T-7, T-9 | Yes |
| { data: ... } response envelope | All API tasks | Yes |
| { error: { code, message } } shape | All API tasks | Yes |
| Zod validation | T-3 (admin) | Recommended |
| Mock DB + testClient pattern | T-3, T-5, T-7, T-8, T-10 | Yes |
| R2 upload | T-9 (not implemented, pattern shown) | Yes |
| QR generation | T-14 | Yes |
| Access code validation regex | T-14 | `/^[A-Z0-9]{6}$/` |
| Drizzle query patterns | All DB tasks | Yes |
| Index usage | T-1 (schema) | Yes |
| Timestamp handling | T-1 (timestamptz) | Yes |

---

## References

### Implementation Summaries
- `/docs/logs/BS_0001_S-1/implementation/T-1/summary/iter-001.md` — Database schema
- `/docs/logs/BS_0001_S-1/implementation/T-1/summary/iter-002.md` — UUID type, common.ts
- `/docs/logs/BS_0001_S-1/implementation/T-2/summary/iter-001.md` — requirePhotographer middleware
- `/docs/logs/BS_0001_S-1/implementation/T-3/summary-1.md` — Admin API, Zod validation
- `/docs/logs/BS_0001_S-1/implementation/T-5/summary/iter-001.md` — Consent API
- `/docs/logs/BS_0001_S-1/implementation/T-7/summary/iter-001.md` — Dashboard API
- `/docs/logs/BS_0001_S-1/implementation/T-8/summary/iter-001.md` — Public API pattern
- `/docs/logs/BS_0001_S-1/implementation/T-9/summary/iter-001.md` — Stripe checkout, R2 upload
- `/docs/logs/BS_0001_S-1/implementation/T-10/summary/iter-001.md` — Webhook idempotency
- `/docs/logs/BS_0001_S-1/implementation/T-11/summary/iter-001.md` — Dashboard UI patterns
- `/docs/logs/BS_0001_S-1/implementation/T-14/summary/iter-001.md` — QR library

### Code References
- `/apps/api/src/index.ts` — Route registration order
- `/apps/api/src/routes/consent.ts` — Protected route example
- `/apps/api/src/routes/credits.ts` — Mixed public/protected, validation example
- `/apps/api/src/routes/admin/credit-packages.ts` — Zod validation example
- `/apps/api/src/middleware/require-photographer.ts` — Auth middleware
- `/apps/api/src/routes/consent.test.ts` — Test pattern
- `/packages/db/src/schema/events.ts` — Events table schema
- `/packages/db/src/schema/common.ts` — Reusable field builders
