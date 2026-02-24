# Upstream Dossier: T-18 (Gallery API)

**Root:** BS_0001_S-1
**Task:** T-18
**Generated:** 2026-01-10

---

## Task Goal

Create `GET /events/:id/photos` endpoint returning paginated photos with CF Images thumbnail URLs.

**Type:** feature
**StoryRefs:** US-9
**PrimarySurface:** API
**Scope:** `apps/api/src/routes/photos.ts`

---

## Acceptance Criteria (verbatim from tasks.md)

- Returns paginated photos (cursor-based, limit 50)
- Each photo has: id, thumbnailUrl (400px), previewUrl (1200px), faceCount, status
- Thumbnail/preview URLs use CF Images transform
- Download URL is presigned R2 URL
- Sorted by uploaded_at desc

**Tests:**

- Unit test pagination
- Test URL generation

**Rollout/Risk:** Low risk

---

## Dependencies

| Task | Description                                | Done |
| ---- | ------------------------------------------ | ---- |
| T-1  | Create database schema (all domain tables) | Yes  |
| T-2  | Implement requirePhotographer middleware   | Yes  |

Both dependencies are complete. T-18 can proceed.

**Note:** T-16 (Photo Upload API) and T-17 (Queue Consumer) are NOT dependencies for T-18. The Gallery API can be implemented independently since photos already exist in the database schema.

---

## Load-Bearing References

| Path                                                     | Purpose                                         |
| -------------------------------------------------------- | ----------------------------------------------- |
| `docs/logs/BS_0001_S-1/plan/final.md`                    | Execution plan with API contract and URL format |
| `docs/logs/BS_0001_S-1/research/cf-images-thumbnails.md` | CF Images transform URL format and research     |
| `packages/db/src/schema/photos.ts`                       | Photos table definition                         |
| `packages/db/src/schema/events.ts`                       | Events table definition                         |
| `apps/api/src/routes/dashboard/route.ts`                 | Reference implementation for API patterns       |
| `apps/api/src/middleware/require-photographer.ts`        | Auth middleware providing photographer context  |

---

## API Contract (from plan/final.md)

```
GET /events/:id/photos?cursor=X&limit=50
Response: {
  data: [{
    id: string,
    thumbnailUrl: string,  // CF Images 400px
    previewUrl: string,    // CF Images 1200px
    downloadUrl: string,   // Presigned R2 URL
    faceCount: number,
    status: "processing" | "indexed" | "failed",
    uploadedAt: string
  }],
  pagination: {
    nextCursor: string | null,
    hasMore: boolean
  }
}
```

### URL Format (from research/cf-images-thumbnails.md)

```
Thumbnail: /cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/photos.sabaipics.com/{r2_key}
Preview:   /cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/photos.sabaipics.com/{r2_key}
Download:  Presigned R2 URL (normalized JPEG, ~4000px)
```

---

## Database Tables Involved

### photos

| Column      | Type        | Notes                                   |
| ----------- | ----------- | --------------------------------------- |
| id          | uuid        | PK                                      |
| event_id    | uuid        | FK to events                            |
| r2_key      | text        | R2 path to normalized JPEG              |
| status      | text        | Enum: 'processing', 'indexed', 'failed' |
| face_count  | integer     | Default 0                               |
| uploaded_at | timestamptz | Default now                             |

**Index:** `photos_event_id_idx` on (event_id)

### events

| Column          | Type        | Notes               |
| --------------- | ----------- | ------------------- |
| id              | uuid        | PK                  |
| photographer_id | uuid        | FK to photographers |
| name            | text        | Required            |
| expires_at      | timestamptz | Required            |
| created_at      | timestamptz | Default now         |

**Index:** `events_photographer_id_idx` on (photographer_id)

---

## Implementation Patterns (from dashboard/route.ts reference)

1. **Env type definition:**

```typescript
type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};
```

2. **Router setup:**

```typescript
export const photosRouter = new Hono<Env>().get(
  '/:eventId/photos',
  requirePhotographer(),
  zValidator('param', schema),
  async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.db();
    // ...
  },
);
```

3. **Response format:** Use `c.json({ data: ... }, pagination: ... })` for paginated responses.

---

## Cursor-Based Pagination Strategy

**Approach:** Use `uploaded_at` as cursor (descending order)

```typescript
// Query pattern
const photos = await db
  .select()
  .from(photos)
  .where(
    and(eq(photos.eventId, eventId), cursor ? lt(photos.uploadedAt, new Date(cursor)) : undefined),
  )
  .orderBy(desc(photos.uploadedAt))
  .limit(limit + 1); // Fetch one extra to determine hasMore

// Determine hasMore and nextCursor
const hasMore = photos.length > limit;
const items = hasMore ? photos.slice(0, limit) : photos;
const nextCursor = hasMore ? items[limit - 1].uploadedAt.toISOString() : null;
```

---

## R2 Presigned URL Generation

Based on R2 binding configuration in `wrangler.jsonc`:

- Binding: `PHOTOS_BUCKET`
- Bucket name: `sabaipics-photos`

```typescript
// Presigned URL for download (15 minute expiry)
const url = await c.env.PHOTOS_BUCKET.signUrl(
  `https://${c.env.PHOTOS_BUCKET.http().hostname}/${photo.r2Key}`,
  900, // 15 minutes
  { method: 'GET' },
);
```

`[NEED_VALIDATION]` Verify R2 `signUrl` method signature in Cloudflare Workers documentation.

---

## Ownership Authorization

**Critical:** Must verify the event belongs to the authenticated photographer before returning photos.

```typescript
// First verify event ownership
const [event] = await db
  .select({ id: events.id })
  .from(events)
  .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
  .limit(1);

if (!event) {
  return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
}
```

---

## CF Images URL Format

Based on research doc, the URLs should be:

```typescript
const R2_BASE_URL = 'https://photos.sabaipics.com';

function generateImageUrl(r2Key: string, width: number, fit: 'cover' | 'contain') {
  return `https://sabaipics.com/cdn-cgi/image/width=${width},fit=${fit},format=auto,quality=${width < 800 ? 75 : 85}/${R2_BASE_URL}/${r2Key}`;
}
```

`[NEED_VALIDATION]` Verify R2 custom domain is configured as `photos.sabaipics.com` in Cloudflare dashboard.

---

## Implied Contracts and Queries

### Photos Query with Pagination

```typescript
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
  .limit(limit + 1);
```

### Event Ownership Check

```typescript
const [event] = await db
  .select({ id: events.id })
  .from(events)
  .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
  .limit(1);
```

---

## Gaps and Uncertainties

| Item                          | Status              | Notes                                                           |
| ----------------------------- | ------------------- | --------------------------------------------------------------- |
| R2 `signUrl` method signature | `[NEED_VALIDATION]` | Need to verify exact API in Workers                             |
| R2 custom domain              | `[NEED_VALIDATION]` | Need to confirm `photos.sabaipics.com` is configured            |
| Pagination response shape     | `[NEED_VALIDATION]` | Should include `pagination.nextCursor` and `pagination.hasMore` |
| Expired event handling        | `[GAP]`             | Should gallery work for expired events?                         |

---

## Decisions Affecting T-18

From `docs/logs/BS_0001_S-1/plan/final.md`:

| #   | Decision                                          | Impact on T-18                                   |
| --- | ------------------------------------------------- | ------------------------------------------------ |
| 5   | Thumbnails = CF Images on-demand (400px / 1200px) | URL generation uses `/cdn-cgi/image/` format     |
| 15  | Storage = Normalized JPEG only (no original)      | Download URL serves the normalized JPEG directly |
| 2   | Image format = Normalize to JPEG (4000px max)     | All photos in R2 are JPEG format                 |

---

## Testing Strategy

1. **Pagination test:**
   - Mock photos with different uploaded_at timestamps
   - Verify cursor-based paging works correctly
   - Verify hasMore flag is accurate

2. **URL generation test:**
   - Verify CF Images transform URL format
   - Verify presigned R2 URL generation

3. **Auth tests:**
   - Verify photographer can only access own events
   - Verify 404 for non-existent events

---

## Route Registration

Register in `apps/api/src/index.ts`:

```typescript
import { photosRouter } from "./routes/photos";

// After Clerk auth middleware
.route("/events", photosRouter);
```

This allows the route `/events/:id/photos` to work correctly.
