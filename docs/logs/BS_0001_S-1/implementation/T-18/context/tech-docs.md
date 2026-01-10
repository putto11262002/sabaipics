# Tech Docs Context for T-18 (Gallery API)

**Task:** T-18 - Gallery API
**Root:** BS_0001_S-1
**Generated:** 2026-01-10

---

## Task Specification (from tasks.md)

```
### T-18 — Gallery API
- [ ] Done
- **Type:** `feature`
- **StoryRefs:** US-9
- **Goal:** Create `GET /events/:id/photos` endpoint returning paginated photos with CF Images thumbnail URLs.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/photos.ts`
- **Dependencies:** `T-1`, `T-2`
- **Acceptance:**
  - Returns paginated photos (cursor-based, limit 50)
  - Each photo has: id, thumbnailUrl (400px), previewUrl (1200px), faceCount, status
  - Thumbnail/preview URLs use CF Images transform
  - Download URL is presigned R2 URL
  - Sorted by uploaded_at desc
- **Tests:**
  - Unit test pagination
  - Test URL generation
- **Rollout/Risk:**
  - Low risk
```

---

## API Conventions

### Framework & Stack
- **Framework:** Hono ^4.10.7 on Cloudflare Workers
- **Validation:** Zod ^4.1.13 with `@hono/zod-validator`
- **ORM:** Drizzle ORM ^0.45.0 with Neon Postgres
- **Auth:** Clerk via `@sabaipics/auth`
- **Storage:** Cloudflare R2 via `PHOTOS_BUCKET` binding

### Response Format

**Paginated list response:**
```typescript
c.json({
  data: items,
  pagination: {
    nextCursor: string | null,
    hasMore: boolean
  }
});
```

**Error responses:**
```typescript
{
  error: {
    code: "ERROR_CODE",
    message: "Human readable message"
  }
}
```

**Error code patterns:**
| Code | HTTP Status | Usage |
|------|-------------|-------|
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Event not owned by photographer |
| `NOT_FOUND` | 404 | Event not found |
| `VALIDATION_ERROR` | 400 | Zod validation failure |

### Routing Pattern

**File:** `apps/api/src/routes/photos.ts` (new file)

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, lt } from "drizzle-orm";
import type { Bindings } from "../types";
import { requirePhotographer, type PhotographerVariables } from "../middleware";
import { photos, events } from "@sabaipics/db";

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

// Zod schemas for validation
const paramsSchema = z.object({
  eventId: z.string().uuid(),
});

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const photosRouter = new Hono<Env>()
  .get("/:eventId/photos", requirePhotographer(), zValidator("param", paramsSchema), zValidator("query", querySchema), async (c) => {
    const { eventId } = c.req.valid("param");
    const { cursor, limit } = c.req.valid("query");
    // Implementation here
  });
```

**Mount in index.ts:**
```typescript
import { photosRouter } from "./routes/photos";

.route("/events", photosRouter)
```

---

## Authentication & Authorization

### Middleware Stack

1. **Clerk Auth** (`createClerkAuth()`) - Applied globally
2. **requirePhotographer()** - Route-level for photographer-only routes

**Pattern:**
```typescript
export const photosRouter = new Hono<Env>()
  .get("/:eventId/photos", requirePhotographer(), async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.db();
    // Verify event ownership before querying photos
  });
```

### Ownership Verification

**Critical:** Must verify event belongs to photographer BEFORE returning photos:

```typescript
// First, verify event ownership
const [event] = await db
  .select({ id: events.id })
  .from(events)
  .where(
    and(
      eq(events.id, eventId),
      eq(events.photographerId, photographer.id)
    )
  )
  .limit(1);

if (!event) {
  return c.json({ error: { code: "NOT_FOUND", message: "Event not found" } }, 404);
}
```

---

## Database Schema (Relevant Tables)

### photos

```typescript
// File: packages/db/src/schema/photos.ts
{
  id: uuid,
  eventId: uuid,              // FK to events
  r2Key: text,                // R2 path (e.g., "events/abc-123/photo.jpg")
  status: "processing" | "indexed" | "failed",
  faceCount: integer,          // Default 0
  uploadedAt: timestamptz      // Default now
}
```

**Index:** `photos_event_id_idx` on (event_id)

### events

```typescript
// File: packages/db/src/schema/events.ts
{
  id: uuid,
  photographerId: uuid,
  name: text,
  startDate: timestamptz | null,
  endDate: timestamptz | null,
  accessCode: text,
  qrCodeR2Key: text | null,
  rekognitionCollectionId: text | null,
  expiresAt: timestamptz,
  createdAt: timestamptz
}
```

**Index:** `events_photographer_id_idx` on (photographer_id)

---

## Expected API Response

**Endpoint:** `GET /events/:id/photos?cursor={timestamp}&limit={number}`

**Response shape:**
```typescript
{
  data: Array<{
    id: string;
    thumbnailUrl: string;    // CF Images transform URL (400px)
    previewUrl: string;      // CF Images transform URL (1200px)
    downloadUrl: string;     // Presigned R2 URL (15 min expiry)
    faceCount: number;
    status: "processing" | "indexed" | "failed";
    uploadedAt: string;      // ISO 8601 timestamp
  }>;
  pagination: {
    nextCursor: string | null;  // ISO timestamp of last item
    hasMore: boolean;
  }
}
```

---

## Cloudflare Images Transform URLs

### URL Format (from research/cf-images-thumbnails.md)

```
Thumbnail: https://sabaipics.com/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/photos.sabaipics.com/{r2_key}
Preview:   https://sabaipics.com/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/photos.sabaipics.com/{r2_key}
```

**Components:**
- Base domain: `https://sabaipics.com`
- Transform prefix: `/cdn-cgi/image/`
- Parameters: `width={px},fit={cover|contain},format=auto,quality={75|85}`
- Source: `https://photos.sabaipics.com/{r2_key}` (R2 custom domain)

### URL Generation Helper

```typescript
const R2_BASE_URL = "https://photos.sabaipics.com";
const CF_DOMAIN = "https://sabaipics.com";

function generateThumbnailUrl(r2Key: string): string {
  return `${CF_DOMAIN}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${R2_BASE_URL}/${r2Key}`;
}

function generatePreviewUrl(r2Key: string): string {
  return `${CF_DOMAIN}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${R2_BASE_URL}/${r2Key}`;
}
```

---

## R2 Presigned URL for Download

### R2 Binding Configuration

From `apps/api/wrangler.jsonc`:
```jsonc
"r2_buckets": [
  {
    "binding": "PHOTOS_BUCKET",
    "bucket_name": "sabaipics-photos"
  }
]
```

### Presigned URL Generation

`[NEED_VALIDATION]` Exact API signature for R2 presigned URLs in Workers:

```typescript
// Option 1: Using signUrl method (if available)
const downloadUrl = await c.env.PHOTOS_BUCKET.signUrl(
  `https://${c.env.PHOTOS_BUCKET.http().hostname}/${photo.r2Key}`,
  900, // 15 minutes
  { method: 'GET' }
);

// Option 2: Using R2's built-in presign (alternative)
const downloadUrl = await c.env.PHOTOS_BUCKET.presign(
  photo.r2Key,
  { expiresIn: 900 } // 15 minutes
);
```

**Note:** Verify correct method in Cloudflare Workers R2 documentation.

---

## Cursor-Based Pagination Strategy

### Cursor Field

Use `uploaded_at` (descending order) as the cursor.

**Advantages:**
- Natural ordering (newest first)
- Stable cursor (timestamps don't change)
- Efficient index usage

### Query Pattern

```typescript
import { eq, and, desc, lt } from "drizzle-orm";

const limit = Math.min(parsedLimit, 50); // Max 50 per acceptance criteria
const cursorLimit = limit + 1; // Fetch one extra to determine hasMore

const photoRows = await db
  .select({
    id: photos.id,
    r2Key: photos.r2Key,
    status: photos.status,
    faceCount: photos.faceCount,
    uploadedAt: photos.uploadedAt,
  })
  .from(photos)
  .where(
    and(
      eq(photos.eventId, eventId),
      cursor ? lt(photos.uploadedAt, new Date(cursor)) : undefined
    )
  )
  .orderBy(desc(photos.uploadedAt))
  .limit(cursorLimit);

// Determine hasMore and trim extra row
const hasMore = photoRows.length > limit;
const items = hasMore ? photoRows.slice(0, limit) : photoRows;
const nextCursor = hasMore ? items[limit - 1].uploadedAt.toISOString() : null;
```

---

## Testing Conventions

### Test Pattern

**File:** `apps/api/src/routes/photos.test.ts` (new file)

```typescript
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { photosRouter } from "./photos";
import type { Database } from "@sabaipics/db";
import type { PhotographerVariables } from "../middleware";

// Mock DB factory
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

// Test app setup
function createTestApp(options: {
  mockDb?: any;
  photographer?: { id: string; pdpaConsentAt: string | null };
  hasAuth?: boolean;
}) {
  const app = new Hono<Env>()
    .use("/*", (c, next) => {
      if (options.hasAuth) c.set("auth", { userId: "clerk_123" });
      return next();
    })
    .use("/*", (c, next) => {
      c.set("db", () => options.mockDb);
      return next();
    })
    .use("/*", (c, next) => {
      if (options.photographer) c.set("photographer", options.photographer);
      return next();
    })
    .route("/events", photosRouter);

  return { app, mockDb: options.mockDb };
}

describe("GET /events/:id/photos", () => {
  it("returns paginated photos with cursor", async () => {
    // Test implementation
  });

  it("generates CF Images transform URLs", async () => {
    // Test implementation
  });

  it("verifies event ownership", async () => {
    // Test implementation
  });
});
```

### Test Commands

```bash
# Run unit tests
pnpm --filter=@sabaipics/api test

# Run specific test file
pnpm --filter=@sabaipics/api test src/routes/photos.test.ts
```

---

## File Locations Summary

| Purpose | Path |
|---------|------|
| New route file | `apps/api/src/routes/photos.ts` |
| New test file | `apps/api/src/routes/photos.test.ts` |
| Mount route | `apps/api/src/index.ts` |
| Middleware | `apps/api/src/middleware/require-photographer.ts` |
| DB schemas | `packages/db/src/schema/photos.ts`, `packages/db/src/schema/events.ts` |
| Type definitions | `apps/api/src/types.ts` |

---

## Drizzle Query Patterns

### Select with cursor-based pagination

```typescript
import { eq, and, desc, lt } from "drizzle-orm";

const photos = await db
  .select({
    id: photos.id,
    r2Key: photos.r2Key,
    status: photos.status,
    faceCount: photos.faceCount,
    uploadedAt: photos.uploadedAt,
  })
  .from(photos)
  .where(
    and(
      eq(photos.eventId, eventId),
      cursor ? lt(photos.uploadedAt, new Date(cursor)) : undefined
    )
  )
  .orderBy(desc(photos.uploadedAt))
  .limit(limit + 1);
```

### Ownership check

```typescript
const [event] = await db
  .select({ id: events.id })
  .from(events)
  .where(
    and(
      eq(events.id, eventId),
      eq(events.photographerId, photographerId)
    )
  )
  .limit(1);
```

---

## References

- Plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Tasks: `docs/logs/BS_0001_S-1/tasks.md`
- Research: `docs/logs/BS_0001_S-1/research/cf-images-thumbnails.md`
- Example route: `apps/api/src/routes/dashboard/route.ts`
- Example test: `apps/api/src/routes/dashboard/route.test.ts`
