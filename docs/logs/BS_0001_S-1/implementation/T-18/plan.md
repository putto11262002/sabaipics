# Implementation Plan

Task: `T-18 — Gallery API`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-10`
Owner: `Claude`

## Inputs
- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: T-18)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-18/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-18/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-18/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-18/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-18/context/risk-scout.md`

## Goal / non-goals
- **Goal:** Create `GET /events/:id/photos` endpoint returning paginated photos with CF Images thumbnail/preview URLs and presigned R2 download URLs
- **Non-goals:**
  - Photo upload (T-16)
  - Face detection (T-17)
  - Event CRUD operations (T-13)
  - Filtering by status (UI can filter)

## Approach (data-driven)

Based on codebase exemplars (`apps/api/src/routes/dashboard/route.ts`):

1. **Add `aws4fetch` dependency:**
   ```bash
   pnpm --filter=@sabaipics/api add aws4fetch
   ```

2. **Create photos router** at `apps/api/src/routes/photos.ts`
   - Use `Hono<Env>` with `PhotographerVariables`
   - Apply `requirePhotographer()` middleware
   - Define Zod schemas for `eventId` param and `cursor`/`limit` query

3. **Verify event ownership** BEFORE querying photos:
   - Query events table by `id` AND `photographer_id`
   - Return 404 if not found (prevents data leakage)

4. **Implement cursor-based pagination:**
   - Use `uploaded_at` as cursor (descending order = newest first)
   - Fetch `limit + 1` items to determine `hasMore`
   - Return `nextCursor` as ISO timestamp of last item

5. **Generate three URL types per photo:**
   - `thumbnailUrl`: CF Images transform (400px, fit=cover, quality=75) - public, edge cached
   - `previewUrl`: CF Images transform (1200px, fit=contain, quality=85) - public, edge cached
   - `downloadUrl`: Presigned R2 URL (15-minute expiry) - prevents hotlinking

6. **Response shape:**
```typescript
{
  data: [{
    id: string,
    thumbnailUrl: string,
    previewUrl: string,
    downloadUrl: string,
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

7. **Register route** in `apps/api/src/index.ts` after Clerk middleware

## Contracts (only if touched)

- **API:**
  - `GET /events/:id/photos?cursor={iso-timestamp}&limit={number}` - Returns paginated photos
  - Auth: Requires Clerk session + photographer record
  - Errors: 401 (unauthenticated), 403 (no photographer), 404 (event not found)

- **R2 URL Format** (validated via research - hybrid approach):
  - `thumbnailUrl`: Public CF Images transform URL (edge cached)
  - `previewUrl`: Public CF Images transform URL (edge cached)
  - `downloadUrl`: Presigned R2 URL (15 min expiry, prevents hotlinking)
  - See `docs/logs/BS_0001_S-1/implementation/T-18/research/r2-presigned-urls.md`

- **Package dependency:**
  - Add `aws4fetch` for presigned URL generation

## Success path

1. User authenticates via Clerk
2. `requirePhotographer()` validates and loads photographer context
3. Zod validates `eventId` (UUID) and `cursor`/`limit` query params
4. Handler verifies event ownership (events table query)
5. Handler executes paginated photos query with cursor
6. URLs generated (CF Images transforms + R2 presigned)
7. Response assembled with `data` + `pagination`

## Failure modes / edge cases (major only)

- **Event not found:** Returns 404 (either doesn't exist or not owned by photographer)
- **No photos:** Returns `{ data: [], pagination: { nextCursor: null, hasMore: false } }`
- **Invalid cursor:** Zod validation error → 400
- **Limit out of range:** Zod validation error → 400
- **Last page:** Returns fewer items with `hasMore: false`

## Validation plan

- **Tests to add:**
  1. Auth tests (401, 403 for no photographer)
  2. Event ownership test (404 for other photographer's event)
  3. Cursor pagination (correct subset, next cursor, hasMore)
  4. URL generation (CF Images format, presigned URL)
  5. Empty event (no photos → empty array)
  6. Limit validation (reject > 50)
  7. Cursor validation (reject invalid datetime)

- **Commands to run:**
  - `pnpm --filter=@sabaipics/api test` (unit tests)
  - `pnpm typecheck` (type checking)

## Rollout / rollback

- Low risk (read-only endpoint, no mutations)
- No migrations needed
- Feature flag not required
- `[OPS]` Verify R2 custom domain `photos.sabaipics.com` is configured before deployment

## Open questions

| Item | Status | Resolution |
|------|--------|------------|
| R2 presigned URL method | ✅ Resolved | Use `aws4fetch` library with S3 API domain |
| Pagination response format | ✅ Resolved | Use `{ data, pagination: {...} }` format |
| Expired events handling | ✅ Resolved | Show photos for expired events (no filter) |
| R2 custom domain configured | `[OPS]` | Verify `photos.sabaipics.com` is set up before deployment |
| R2 API credentials | `[OPS]` | Set via `wrangler secret put` (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CLOUDFLARE_ACCOUNT_ID) |

## Files to create/modify

| File | Action |
|------|--------|
| `apps/api/package.json` | Modify (add aws4fetch dependency) |
| `apps/api/src/routes/photos.ts` | Create |
| `apps/api/src/routes/photos.test.ts` | Create |
| `apps/api/src/index.ts` | Modify (add route) |

**Note:** `wrangler.jsonc` and `types.ts` already updated with CF_DOMAIN, R2_BASE_URL, and secret bindings.

## References

- Research doc: `docs/logs/BS_0001_S-1/research/cf-images-thumbnails.md`
- Exemplar route: `apps/api/src/routes/dashboard/route.ts`
- Exemplar test: `apps/api/src/routes/dashboard/route.test.ts`
- Photos schema: `packages/db/src/schema/photos.ts`
- Events schema: `packages/db/src/schema/events.ts`
