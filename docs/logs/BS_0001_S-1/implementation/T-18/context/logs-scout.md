# Logs Scout: T-18 (Gallery API)

**Root:** `BS_0001_S-1`
**Scanned:** T-1, T-2, T-5, T-7, T-8, T-14
**Date:** 2026-01-10

---

## Established Patterns

### Database & Schema (T-1)

1. **ID Type:** Native Postgres `uuid` type with `gen_random_uuid()` default
   - File: `packages/db/src/schema/photos.ts`

2. **Timestamp Helpers:** Use `timestamptz` from `common.ts`

   ```typescript
   uploadedAt: timestamptz('uploaded_at').defaultNow().notNull();
   ```

3. **Text Enums:** Defined as arrays with type exports

   ```typescript
   export const photoStatuses = ['processing', 'indexed', 'failed'] as const;
   export type PhotoStatus = (typeof photoStatuses)[number];
   ```

4. **R2 Storage:** Store `r2_key` (not URL) - URLs change, keys are immutable

5. **Type Exports:**
   - Select type: `Photo` (e.g., `Photo`)
   - Insert type: `NewPhoto`

### Middleware Architecture (T-2)

1. **Middleware Location:** `apps/api/src/middleware/require-photographer.ts`

2. **DB Access Pattern:**

   ```typescript
   const db = c.var.db();
   ```

3. **Photographer Context Type:**

   ```typescript
   type PhotographerContext = {
     id: string;
     pdpaConsentAt: string | null;
   };
   ```

4. **Middleware Chaining:**
   ```typescript
   app.get('/events/:id/photos', requirePhotographer(), handler);
   ```

### API Route Pattern (T-5, T-7, T-8)

1. **Route Registration:** After Clerk auth middleware in `index.ts`

   ```typescript
   .use("/*", createClerkAuth())
   .route("/events", photosRouter)
   ```

2. **Error Response Shape:**

   ```typescript
   { error: { code: string, message: string } }
   ```

3. **Success Response Shape:**

   ```typescript
   // Lists
   c.json({ data: items, pagination: {...} });
   ```

4. **Status Codes:**
   - 200: OK (GET)
   - 401: Unauthenticated
   - 403: Forbidden
   - 404: Not found

### Dashboard API Pattern (T-7)

1. **Env Type Definition:**

   ```typescript
   type Env = {
     Bindings: Bindings;
     Variables: PhotographerVariables;
   };
   ```

2. **Router Setup:**

   ```typescript
   export const router = new Hono<Env>().get(
     '/:eventId/photos',
     requirePhotographer(),
     async (c) => {
       const photographer = c.var.photographer;
       const db = c.var.db();
     },
   );
   ```

3. **Drizzle Query Patterns:**

   ```typescript
   import { eq, and, desc, lt } from 'drizzle-orm';

   const items = await db
     .select()
     .from(photos)
     .where(
       and(
         eq(photos.eventId, eventId),
         cursor ? lt(photos.uploadedAt, new Date(cursor)) : undefined,
       ),
     )
     .orderBy(desc(photos.uploadedAt))
     .limit(limit + 1);
   ```

### Credit Packages API Pattern (T-8)

1. **Zod Validation with @hono/zod-validator:**

   ```typescript
   import { zValidator } from '@hono/zod-validator';

   export const router = new Hono<Env>().get(
     '/:id',
     zValidator('param', paramSchema),
     async (c) => {
       const { id } = c.req.valid('param');
     },
   );
   ```

### QR Code Library (T-14)

1. **R2 Upload Pattern:**

   ```typescript
   await c.env.PHOTOS_BUCKET.put(key, data, {
     httpMetadata: { contentType: 'image/png' },
   });
   ```

2. **R2 Key Pattern:**
   - QR codes stored as `qr-codes/{accessCode}.png`
   - Photos stored as `events/{eventId}/{photoId}.jpg`

---

## Known Limitations

| Source | Limitation                                        | Status            |
| ------ | ------------------------------------------------- | ----------------- |
| T-7    | No transaction wrapping for multi-step operations | Accepted for MVP  |
| T-14   | QR code generation eager (not lazy)               | Accepted per plan |

---

## Follow-ups That May Impact T-18

| Source | Follow-up                 | Impact |
| ------ | ------------------------- | ------ |
| None   | No follow-ups impact T-18 | —      |

---

## Conventions for T-18

Based on established patterns, T-18 (Gallery API) should:

1. **Register routes** after Clerk auth middleware
2. **Use middleware:** `requirePhotographer()` for authenticated access
3. **Use Zod validation** with `zValidator` for route parameters
4. **Follow type exports:** `PhotographerContext`, `PhotographerVariables`
5. **Use `c.var.db()`** for database access
6. **Use cursor-based pagination** with `uploaded_at` as cursor
7. **Use testClient** for unit tests with proper type inference
8. **Return consistent status codes:** 200/401/403/404
9. **Verify event ownership** before returning photos
10. **Use CF Images transform URLs** for thumbnails/previews

---

## Database Indexes Relevant to T-18

From migration `packages/db/drizzle/0001_ambiguous_the_liberteens.sql`:

| Index                        | Columns           | Purpose                                       |
| ---------------------------- | ----------------- | --------------------------------------------- |
| `photos_event_id_idx`        | `event_id`        | Efficient filtering by event                  |
| `events_photographer_id_idx` | `photographer_id` | Efficient ownership verification              |
| `photos_status_idx`          | `status`          | Not used by T-18, but available for filtering |

---

## Pagination Pattern (Based on T-7 Dashboard)

```typescript
// Cursor-based pagination using uploaded_at
const limit = Math.min(parsedLimit, 50); // Max 50
const cursorLimit = limit + 1; // Fetch one extra for hasMore check

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
    and(eq(photos.eventId, eventId), cursor ? lt(photos.uploadedAt, new Date(cursor)) : undefined),
  )
  .orderBy(desc(photos.uploadedAt))
  .limit(cursorLimit);

const hasMore = photos.length > limit;
const items = hasMore ? photos.slice(0, limit) : photos;
const nextCursor = hasMore ? items[limit - 1].uploadedAt.toISOString() : null;
```
