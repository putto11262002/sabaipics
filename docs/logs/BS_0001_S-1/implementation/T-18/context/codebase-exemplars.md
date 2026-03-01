# Codebase Exemplars for T-18 (Gallery API)

**Surface:** API
**Task:** Gallery API for paginated photo display

---

## 1. Best Exemplars

### Exemplar 1: Dashboard Route - Authenticated Route with Query Params

**File:** `/apps/api/src/routes/dashboard/route.ts`

**Pattern:**

- Uses `requirePhotographer()` middleware for Clerk-based auth
- Accesses authenticated photographer via `c.var.photographer`
- Uses `c.var.db()` for database access
- Follows consistent error response shape
- Uses Drizzle ORM with proper imports

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, gt, sql, count, sum } from 'drizzle-orm';
import { events, photos, creditLedger } from '@sabaipics/db';
import { requirePhotographer, type PhotographerVariables } from '../../middleware';
import type { Bindings } from '../../types';

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

export const dashboardRouter = new Hono<Env>().get('/', requirePhotographer(), async (c) => {
  const photographer = c.var.photographer;
  const db = c.var.db();

  // Database queries here...

  return c.json({ data: result });
});
```

**Why it matters:** This is the exact pattern T-18 should follow for authenticated photographer routes.

---

### Exemplar 2: Credit Packages Route - Zod Validation for Params

**File:** `/apps/api/src/routes/admin/credit-packages.ts`

**Pattern:**

- Zod schemas for parameter validation
- Uses `zValidator("param", schema)` and `zValidator("query", schema)`
- Proper error handling with status codes

```typescript
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const paramSchema = z.object({
  id: z.string().uuid(),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const router = new Hono<Env>().get(
  '/:id',
  zValidator('param', paramSchema),
  zValidator('query', querySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { limit } = c.req.valid('query');
    // Use validated params
  },
);
```

**Why it matters:** T-18 needs to validate `eventId` parameter and `cursor`/`limit` query params.

---

### Exemplar 3: Consent Route - Error Response Shape

**File:** `/apps/api/src/routes/consent.ts`

**Pattern:**

- Consistent error response: `{ error: { code, message } }`
- Proper status codes (401, 403, 404, 409)

```typescript
// Error helpers
function notFoundError(message: string) {
  return {
    error: {
      code: "NOT_FOUND",
      message,
    },
  };
}

// In handler
const [existing] = await db.select().from(table).where(...).limit(1);
if (!existing) {
  return c.json(notFoundError("Resource not found"), 404);
}
```

**Why it matters:** T-18 should return consistent error responses, especially for 404 (event not found).

---

### Exemplar 4: Dashboard Test - Mock DB Pattern

**File:** `/apps/api/src/routes/dashboard/route.test.ts`

**Pattern:**

- Vitest with `describe/it/expect`
- Hono `testClient` for type-safe testing
- Mock DB with chainable methods
- Test app factory with dependency injection

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { testClient } from 'hono/testing';
import { dashboardRouter } from './route';
import type { Database } from '@sabaipics/db';
import type { PhotographerVariables } from '../../middleware';

const MOCK_PHOTOGRAPHER_ID = '11111111-1111-1111-1111-111111111111';

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

// Test app factory
function createTestApp(options: {
  mockDb?: any;
  photographer?: { id: string; pdpaConsentAt: string | null } | null;
  hasAuth?: boolean;
}) {
  const {
    mockDb = createMockDb(),
    photographer = { id: MOCK_PHOTOGRAPHER_ID, pdpaConsentAt: new Date().toISOString() },
    hasAuth = true,
  } = options;

  const app = new Hono<Env>()
    .use('/*', (c, next) => {
      if (hasAuth) c.set('auth', { userId: 'clerk_123', sessionId: 'session_123' });
      return next();
    })
    .use('/*', (c, next) => {
      c.set('db', () => mockDb as unknown as Database);
      return next();
    })
    .use('/*', (c, next) => {
      if (photographer) c.set('photographer', photographer);
      return next();
    })
    .route('/dashboard', dashboardRouter);

  return { app, mockDb };
}

describe('GET /dashboard', () => {
  it('returns dashboard data for authenticated photographer', async () => {
    const { app } = createTestApp({});
    const client = testClient(app);
    const res = await client.dashboard.$get();
    expect(res.status).toBe(200);
  });
});
```

**Why it matters:** Follow this exact pattern for T-18 photos API tests.

---

## 2. Photos Schema Reference

**File:** `/packages/db/src/schema/photos.ts`

```typescript
import { pgTable, text, integer, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz } from './common';
import { events } from './events';

export const photoStatuses = ['processing', 'indexed', 'failed'] as const;
export type PhotoStatus = (typeof photoStatuses)[number];

export const photos = pgTable(
  'photos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    r2Key: text('r2_key').notNull(),
    status: text('status', { enum: photoStatuses }).notNull().default('processing'),
    faceCount: integer('face_count').default(0),
    uploadedAt: timestamptz('uploaded_at').defaultNow().notNull(),
  },
  (table) => [
    index('photos_event_id_idx').on(table.eventId),
    index('photos_status_idx').on(table.status),
  ],
);

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
```

**Key fields for T-18:**

- `id` - Photo UUID
- `eventId` - FK to events (for filtering)
- `r2Key` - R2 storage path (for URL generation)
- `status` - Processing status
- `faceCount` - Number of faces detected
- `uploadedAt` - For cursor-based pagination (descending)

---

## 3. Events Schema Reference

**File:** `/packages/db/src/schema/events.ts`

```typescript
import { pgTable, text, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';
import { photographers } from './photographers';

export const events = pgTable(
  'events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: uuid('photographer_id')
      .notNull()
      .references(() => photographers.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    startDate: timestamptz('start_date'),
    endDate: timestamptz('end_date'),
    accessCode: text('access_code').notNull().unique(),
    qrCodeR2Key: text('qr_code_r2_key'),
    rekognitionCollectionId: text('rekognition_collection_id'),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAtCol(),
  },
  (table) => [
    index('events_photographer_id_idx').on(table.photographerId),
    index('events_access_code_idx').on(table.accessCode),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
```

**Key fields for T-18 ownership check:**

- `id` - Event UUID (from route param)
- `photographerId` - For ownership verification

---

## 4. R2 Bucket Configuration

**File:** `/apps/api/wrangler.jsonc`

```jsonc
"r2_buckets": [
  {
    "binding": "PHOTOS_BUCKET",
    "bucket_name": "sabaipics-photos"
  }
]
```

**Usage in code:**

```typescript
// Access via c.env.PHOTOS_BUCKET
const object = await c.env.PHOTOS_BUCKET.get(r2Key);
```

---

## 5. Type Definitions Reference

**File:** `/apps/api/src/types.ts`

```typescript
import type { AuthVariables } from '@sabaipics/auth/types';
import type { Database } from '@sabaipics/db';

export type Bindings = CloudflareBindings & {
  ADMIN_API_KEY: string;
};

export type Variables = AuthVariables & {
  db: () => Database;
};

export type Env = { Bindings: Bindings; Variables: Variables };
```

**PhotographerVariables** (from middleware):

```typescript
export type PhotographerVariables = AuthVariables & {
  db: () => Database;
  photographer: PhotographerContext;
};

type PhotographerContext = Pick<Photographer, 'id' | 'pdpaConsentAt'>;
```

---

## 6. Anti-Patterns to Avoid

### DO NOT:

1. **Skip ownership verification** - Always verify event belongs to photographer:

   ```typescript
   // BAD - returns photos for any event
   const photos = await db.select().from(photos).where(eq(photos.eventId, eventId));

   // GOOD - verify ownership first
   const [event] = await db
     .select()
     .from(events)
     .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
     .limit(1);
   if (!event) return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
   ```

2. **Use offset-based pagination** - Cursor is more efficient:

   ```typescript
   // BAD - offset becomes slow with large offsets
   .limit(limit).offset(offset)

   // GOOD - cursor-based with indexed timestamp
   .where(cursor ? lt(photos.uploadedAt, new Date(cursor)) : undefined)
   ```

3. **Generate URLs incorrectly** - Follow CF Images format:

   ```typescript
   // BAD - missing transform parameters
   `https://photos.sabaipics.com/${r2Key}`
   // GOOD - CF Images transform URL
   `https://sabaipics.com/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/https://photos.sabaipics.com/${r2Key}`;
   ```

4. **Return all photos without limit** - Always paginate:

   ```typescript
   // BAD - could return thousands of photos
   .select().from(photos).where(eq(photos.eventId, eventId))

   // GOOD - paginated with max limit
   .limit(Math.min(limit, 50) + 1)
   ```

5. **Forget to handle empty results** - Return appropriate response:

   ```typescript
   // BAD - inconsistent response shape
   if (photos.length === 0) return c.json(null);

   // GOOD - consistent pagination response
   return c.json({ data: [], pagination: { nextCursor: null, hasMore: false } });
   ```

---

## 7. Route Registration Pattern

**File:** `/apps/api/src/index.ts`

```typescript
import { photosRouter } from './routes/photos';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  // ... existing middleware and routes ...
  .use('/*', createClerkAuth())
  .route('/dashboard', dashboardRouter)
  .route('/events', photosRouter); // NEW - register photos router

export type AppType = typeof app;
```

**Note:** Route is `/events/:id/photos`, so we mount at `/events` and define `:eventId/photos` in the photos router.

---

## 8. Database Query Patterns

### Select with cursor pagination

```typescript
import { eq, and, desc, lt } from 'drizzle-orm';

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
    and(eq(photos.eventId, eventId), cursor ? lt(photos.uploadedAt, new Date(cursor)) : undefined),
  )
  .orderBy(desc(photos.uploadedAt))
  .limit(limit + 1);
```

### Ownership check

```typescript
const [event] = await db
  .select({ id: events.id })
  .from(events)
  .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
  .limit(1);
```

---

## Summary

For T-18 Gallery API implementation:

1. **Copy structure from:** `dashboard/route.ts` (auth pattern) + `credit-packages.ts` (validation pattern)
2. **Use middleware:** `requirePhotographer()` for authentication
3. **Use Zod:** Define schemas for `eventId` param and `cursor`/`limit` query
4. **Verify ownership:** Check event belongs to photographer before returning photos
5. **Cursor pagination:** Use `uploaded_at` as cursor (descending)
6. **URL generation:** Follow CF Images transform URL format exactly
7. **Test pattern:** Use `testClient`, mock DB, test auth + happy path + edge cases
8. **Error shape:** `{ error: { code, message } }` with appropriate status codes
9. **Max limit:** 50 per acceptance criteria
10. **Presigned URL:** `[NEED_VALIDATION]` Verify R2 `signUrl` or `presign` method
