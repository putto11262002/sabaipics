# Tech Docs Scout Report

Task: T-13 (Events API - CRUD + QR generation)
Root: BS_0001_S-1
Date: 2026-01-10

## Must-follow conventions

### API surface

**Framework & Runtime:**
- **Framework:** Hono ^4.10.7 on Cloudflare Workers (compatibility_date: 2025-12-06)
- **Runtime:** Cloudflare Workers with `nodejs_compat` flag enabled
- **Location:** `apps/api/src/routes/` for route handlers

**Route Registration Pattern:**
```typescript
// In apps/api/src/index.ts
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  .use("/webhooks/*", /* DB injection for webhooks */)
  .route("/webhooks", webhookRouter)
  .use("/*", cors(...))
  .use("/*", /* DB injection */)
  .route("/admin", adminRouter)      // API key auth (before Clerk)
  .route("/credit-packages", creditsRouter)  // Public routes
  .use("/*", createClerkAuth())     // Clerk auth for protected routes
  .route("/dashboard", dashboardRouter)
  .route("/events", eventsRouter);   // Add events route here
```

**Request Validation:**
- Use `@hono/zod-validator` with `zValidator` for type-safe validation
- Validate params, query, and JSON bodies separately
- Example:
  ```typescript
  import { zValidator } from "@hono/zod-validator";
  import { z } from "zod";
  
  const createEventSchema = z.object({
    name: z.string().min(1).max(100),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  });
  
  .post("/", requirePhotographer(), zValidator("json", createEventSchema), async (c) => {
    const data = c.req.valid("json");
    // ...
  });
  ```

**Response Format:**
- Success responses use `{ data: <T> }` envelope
- Error responses use `{ error: { code, message } }` envelope
- Use `createAuthError` from `@sabaipics/auth/errors` for auth errors
- Define custom error helpers for domain-specific errors:
  ```typescript
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
  ```

**HTTP Status Codes:**
- 200: OK (GET, PATCH success)
- 201: Created (POST success)
- 400: Bad Request (validation errors)
- 401: Unauthorized (no valid auth session)
- 403: Forbidden (photographer not in DB, or resource not owned)
- 404: Not Found (resource doesn't exist)
- 409: Conflict (already exists, idempotent conflict)

**Route Handler Pattern:**
```typescript
import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { events } from "@sabaipics/db";
import { requirePhotographer, requireConsent, type PhotographerVariables } from "../../middleware";
import type { Bindings } from "../../types";

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

export const eventsRouter = new Hono<Env>()
  .get("/", requirePhotographer(), requireConsent(), async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.db();
    // ... handler logic
    return c.json({ data: result });
  });
```

### Database & data layer

**ORM & Driver:**
- **ORM:** Drizzle ORM ^0.45.0
- **Driver:** @neondatabase/serverless ^1.0.2
- **Database:** Neon Postgres (serverless)
- **Schema location:** `packages/db/src/schema/`

**DB Access Pattern:**
```typescript
// DB is injected via middleware, accessed via c.var.db()
const db = c.var.db();

// Query pattern
const [event] = await db
  .select()
  .from(events)
  .where(eq(events.id, id))
  .limit(1);

// Insert with returning
const [created] = await db
  .insert(events)
  .values({ /* fields */ })
  .returning();

// Update
const [updated] = await db
  .update(events)
  .set({ /* fields */ })
  .where(eq(events.id, id))
  .returning();
```

**Schema Types:**
- Select type: `<TableName>` (e.g., `Event`, `Photographer`)
- Insert type: `New<TableName>` (e.g., `NewEvent`, `NewPhotographer`)
- Import from schema:
  ```typescript
  import { events, type Event, type NewEvent } from "@sabaipics/db";
  ```

**Timestamp Helpers:**
- Use `timestamptz()` for timestamp columns with timezone
- Use `createdAtCol()` for standard created_at columns
- All timestamps are strings in "string" mode with timezone
- Example:
  ```typescript
  import { timestamptz, createdAtCol } from "./common";
  
  createdAt: createdAtCol(),                    // created_at
  expiresAt: timestamptz("expires_at").notNull()  // Custom timestamp
  ```

**Events Schema (from packages/db/src/schema/events.ts):**
```typescript
export const events = pgTable("events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  photographerId: uuid("photographer_id")
    .notNull()
    .references(() => photographers.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  startDate: timestamptz("start_date"),
  endDate: timestamptz("end_date"),
  accessCode: text("access_code").notNull().unique(),  // 6-char code for QR
  qrCodeR2Key: text("qr_code_r2_key"),  // R2 key for generated QR PNG
  rekognitionCollectionId: text("rekognition_collection_id"),  // Nullable
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: createdAtCol(),
});
```

### Authentication & authorization

**Middleware Chain:**
- `requirePhotographer()`: Verifies Clerk auth and photographer exists in DB
- `requireConsent()`: Verifies PDPA consent has been given
- Use both for protected routes:
  ```typescript
  .get("/", requirePhotographer(), requireConsent(), async (c) => {
    // Handler
  });
  ```

**Photographer Context:**
```typescript
type PhotographerContext = Pick<Photographer, "id" | "pdpaConsentAt">;

// Access in handler
const photographer = c.var.photographer;  // { id, pdpaConsentAt }
```

**Authorization:**
- Photographers can only access their own events
- Filter queries by photographer_id:
  ```typescript
  .where(eq(events.photographerId, photographer.id))
  ```

### R2 storage

**Bucket Binding:**
- Use existing `PHOTOS_BUCKET` binding from Cloudflare environment
- Access via `c.env.PHOTOS_BUCKET`

**Key Pattern:**
- QR codes: `qr/{eventId}.png`
- Photos: `events/{eventId}/photos/{photoId}` (future)

**Upload Pattern:**
```typescript
// Upload to R2
const qrKey = `qr/${eventId}.png`;
await c.env.PHOTOS_BUCKET.put(qrKey, qrPng, {
  httpMetadata: { contentType: "image/png" }
});

// Store key in database (not URL)
await db.update(events)
  .set({ qrCodeR2Key: qrKey })
  .where(eq(events.id, eventId));
```

**Important:** Always store R2 key (not URL) in database. URLs can change, keys are immutable.

### QR generation (T-14 dependency)

**Library:** `@juit/qrcode` (installed in T-14)
**Location:** `apps/api/src/lib/qr/generate.ts`

**Usage Pattern:**
```typescript
import { generateEventQR } from "../lib/qr/generate";

// Generate QR PNG
const qrPng = await generateEventQR(
  accessCode,      // 6-character uppercase alphanumeric code
  c.env.APP_BASE_URL  // Base URL from environment
);
// Returns: Uint8Array (PNG binary)
```

**QR Content:**
- Encodes search URL: `{baseUrl}/search/{accessCode}`
- Error correction: "M" (15% - medium)
- Margin: 4 modules (standard quiet zone)

### Environment variables

**Required Bindings (from apps/api/src/types.ts):**
```typescript
export type Bindings = CloudflareBindings & {
  ADMIN_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  APP_BASE_URL: string;  // Required for QR generation
  DATABASE_URL: string;  // Neon connection string
  PHOTOS_BUCKET: R2Bucket;  // R2 bucket binding
};
```

**APP_BASE_URL Usage:**
- Used for QR code URL generation
- Format: `https://sabaipics.com` (production), `http://localhost:5173` (dev)
- No trailing slash

## Repo-specific patterns

### Route file structure

```
apps/api/src/routes/events/
├── index.ts           # Main router with all CRUD routes
├── types.ts           # Request/response types
└── events.test.ts     # Unit tests
```

### Type definition pattern

**Request types (types.ts):**
```typescript
export interface CreateEventRequest {
  name: string;
  startDate?: string;  // ISO datetime
  endDate?: string;    // ISO datetime
}

export interface UpdateEventRequest {
  name?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface EventResponse extends Event {
  qrCodeUrl?: string;  // Signed R2 URL (computed)
}
```

**Response types:**
```typescript
export interface EventsListResponse {
  data: EventResponse[];
}

export interface EventDetailResponse {
  data: EventResponse;
}
```

### Access code generation

**Requirements:**
- 6-character uppercase alphanumeric (A-Z, 0-9)
- Must be unique across all events
- Format: `/^[A-Z0-9]{6}$/`

**Generation Strategy:**
```typescript
// Option 1: Simple random (with retry on collision)
function generateAccessCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// In handler, loop until unique code found
let accessCode: string;
let attempts = 0;
do {
  accessCode = generateAccessCode();
  const [existing] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.accessCode, accessCode))
    .limit(1);
  if (!existing) break;
  attempts++;
} while (attempts < 10);
```

### Expiry date calculation

**Default expiry:** 30 days from creation
```typescript
import { addDays } from "date-fns";  // or use SQL

const expiresAt = new Date();
expiresAt.setDate(expiresAt.getDate() + 30);

// Or use SQL default in schema:
// expiresAt: timestamptz("expires_at").notNull().default(sql`NOW() + interval '30 days'`)
```

### Error handling patterns

**Validation Error:**
```typescript
function validationError(message: string, details?: z.ZodIssue[]) {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message,
      ...(details && { details }),
    },
  };
}

// Usage
if (!data.name || data.name.length > 100) {
  return c.json(validationError("Name must be 1-100 characters"), 400);
}
```

**Not Found Error:**
```typescript
function notFoundError(message: string) {
  return {
    error: {
      code: "NOT_FOUND",
      message,
    },
  };
}

// Usage
const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
if (!event) {
  return c.json(notFoundError("Event not found"), 404);
}
```

**Forbidden Error (not owner):**
```typescript
import { createAuthError } from "@sabaipics/auth/errors";

// Usage
if (event.photographerId !== photographer.id) {
  return c.json(
    createAuthError("FORBIDDEN", "You do not have access to this event"),
    403
  );
}
```

### Testing patterns

**Test Framework:** Vitest ^3.2.0 with `@cloudflare/vitest-pool-workers` ^0.10.14

**Test Configuration:**
- Unit tests: `vitest.node.config.ts` (include: `src/**/*.test.ts`)
- Worker tests: `vitest.integration.config.ts`

**Test Client Pattern:**
```typescript
import { testClient } from "hono/testing";
import { eventsRouter } from "../routes/events";
import { MOCK_ENV } from "../tests/fixtures";

const client = testClient(eventsRouter, MOCK_ENV);

// GET list
const response = await client.events.$get(undefined, {
  headers: { Authorization: `Bearer ${token}` }
});

// GET by ID
const response = await client.events[":id"].$get({
  param: { id: eventId }
});

// POST create
const response = await client.events.$post({
  json: { name: "Test Event", startDate: "2026-01-10T10:00:00Z" }
});

// PATCH update
const response = await client.events[":id"].$patch({
  param: { id: eventId },
  json: { name: "Updated Event" }
});
```

## Task-specific acceptance criteria

### T-13 Requirements (from tasks.md)

**Endpoints:**
1. `POST /events` - Create event
   - Creates event with unique access_code
   - Generates QR PNG
   - Uploads QR to R2
   - Sets `expires_at = created_at + 30 days`
   - `rekognition_collection_id` starts as NULL
   - Returns created event

2. `GET /events` - List photographer's events
   - Returns photographer's events only
   - Sorted by createdAt desc
   - Include photo/face counts (join with photos table)

3. `GET /events/:id` - Get single event
   - Returns event with QR URL (signed R2 URL)
   - Must verify photographer owns the event

**Acceptance:**
- All CRUD operations working
- Access code is unique and 6 characters
- QR code generated and uploaded to R2
- 30-day expiry set correctly
- Photographer can only access their own events
- Tests cover all endpoints

## References

### Primary docs
- Architecture: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/docs/tech/ARCHITECTURE.md`
- Tech Stack: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/docs/tech/TECH_STACK.md`

### Schema
- Events schema: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/packages/db/src/schema/events.ts`
- Common helpers: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/packages/db/src/schema/common.ts`

### Existing patterns (for reference)
- Dashboard API: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/apps/api/src/routes/dashboard/route.ts`
- Admin credit packages API: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/apps/api/src/routes/admin/credit-packages.ts`
- Middleware: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/apps/api/src/middleware/index.ts`

### Task context
- Tasks: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/docs/logs/BS_0001_S-1/tasks.md`
- T-13 Specification: Lines 322-346 in tasks.md
- T-14 (QR Library): `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent1/docs/logs/BS_0001_S-1/implementation/T-14/context/tech-docs.md`

### External documentation
- Hono: https://hono.dev
- Drizzle ORM: https://orm.drizzle.team
- Zod: https://zod.dev
- Cloudflare R2: https://developers.cloudflare.com/r2/
