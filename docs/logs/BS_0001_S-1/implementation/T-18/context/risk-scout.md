# Risk Scout Report: T-18 Gallery API

**Task:** Create `GET /events/:id/photos` endpoint returning paginated photos with CF Images thumbnail URLs.
**Execution root:** `BS_0001_S-1`
**Generated:** 2026-01-10

---

## 1. Security Risks

### Authorization Leakage

**[RISK] Photographer can access photos from events they don't own**

**Mitigation:** MUST verify event ownership before querying photos:

```typescript
// CRITICAL: Always verify ownership first
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

**Test case:** Attempt to access photos of another photographer's event → 404

### Presigned URL Security

**[RISK] Presigned URLs might leak if not properly scoped**

**Mitigation:**
- Use short expiry (15 minutes max)
- URLs are specific to individual photos (not bulk)
- No sensitive data in URLs (only R2 keys)

---

## 2. Data Validation Risks

### Cursor Parameter Validation

**[RISK] Invalid cursor format could cause query errors**

**Mitigation:** Validate cursor is a valid ISO timestamp:

```typescript
const querySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
```

### Event ID Validation

**[RISK] Invalid UUID format**

**Mitigation:** Use Zod UUID validation:

```typescript
const paramsSchema = z.object({
  eventId: z.string().uuid("Invalid event ID format"),
});
```

---

## 3. Performance Concerns

### Large Result Sets

**[RISK] Event with 1000+ photos could cause slow queries**

**Current mitigation:**
- Cursor-based pagination (efficient for large sets)
- Max limit of 50 per request
- Index on `photos_event_id_idx`

**Query performance:**
```sql
-- Uses index: photos_event_id_idx
SELECT * FROM photos
WHERE event_id = ? AND uploaded_at < ?
ORDER BY uploaded_at DESC
LIMIT 51;
```

**Index coverage:** Query uses `event_id` index with `uploaded_at` ordering. Should be efficient even for 1000s of photos.

### N+1 Query Risk

**[RISK]** Not applicable - no per-item queries needed

**Mitigation:** All data comes from single query + URL generation (no DB calls)

### URL Generation Performance

**[RISK]** String concatenation for URLs is trivial (negligible)

---

## 4. Cloudflare Images Integration Risks

### Custom Domain Configuration

**[RISK] R2 custom domain `photos.sabaipics.com` might not be configured**

**Impact:** URLs would 404

**Mitigation:**
- `[NEED_VALIDATION]` Verify R2 custom domain is set up in Cloudflare dashboard
- Add ops note to verify before deployment

### Transform Parameters

**[RISK] Incorrect transform parameters could break images**

**Current parameters (from research doc):**
- Thumbnail: `width=400,fit=cover,format=auto,quality=75`
- Preview: `width=1200,fit=contain,format=auto,quality=85`

**Validation:**
- `fit=cover` crops to fill (good for grid thumbnails)
- `fit=contain` fits within bounds (good for preview)
- `format=auto` serves WebP/AVIF to supported browsers

### Caching Behavior

**[RISK] First request is slow (transform + R2 fetch), subsequent fast**

**Mitigation:** CF Images caches transformed variants at edge. Acceptable for MVP.

---

## 5. R2 Presigned URL Risks

### Method Signature Uncertainty

**[NEED_VALIDATION]** Exact API for presigned URLs in Cloudflare Workers:

**Option A:** `signUrl` method
```typescript
const url = await bucket.signUrl(
  `https://${bucket.http().hostname}/${key}`,
  900,
  { method: 'GET' }
);
```

**Option B:** `presign` method
```typescript
const url = await bucket.presign(key, { expiresIn: 900 });
```

**Resolution required:** Check Cloudflare Workers R2 documentation for correct method.

### URL Length Limits

**[RISK] Presigned URLs can be very long (1000+ characters with signatures)**

**Impact:** Not a concern - returned in JSON, not in URL params

---

## 6. Edge Cases

### Empty Event

**Scenario:** Event with no photos uploaded

**Expected response:**
```json
{
  "data": [],
  "pagination": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

**Handled by:** Natural query result (empty array)

### Last Page

**Scenario:** Request with cursor returns fewer than `limit` items

**Expected response:** `hasMore: false`, `nextCursor: null`

**Handled by:** `hasMore = photos.length > limit` check

### Single Photo

**Scenario:** Event with exactly 1 photo

**Behavior:**
- First request (no cursor): Returns 1 photo, `hasMore: false`
- Next request with cursor: Returns empty array, `hasMore: false`

**Handled by:** Cursor query returns 0 results for `uploaded_at < last_timestamp`

### Processing vs Indexed Photos

**Scenario:** Mix of `processing`, `indexed`, and `failed` status photos

**Behavior:** Return all photos regardless of status (UI can filter)

**Per spec:** Return `status` field in response so UI can display badges

---

## 7. Response Schema Uncertainties

### Pagination Response Shape

**[GAP] Exact pagination response format not specified in task**

**Proposed format:**
```json
{
  "data": [...],
  "pagination": {
    "nextCursor": "2025-01-10T12:00:00Z" | null,
    "hasMore": true | false
  }
}
```

**Alternative formats considered:**
1. `{ data, nextCursor, hasMore }` - Flat structure
2. `{ data, meta: { cursor, limit, total } }` - More metadata

**Recommendation:** Use nested `pagination` object (matches dashboard pattern)

---

## 8. Merge Conflict Hotspots

**Files that may have parallel changes:**

1. **`apps/api/src/index.ts`** - Route registration
   - T-13 (Events API) will also add `/events` routes
   - **Conflict risk:** Medium - same base route
   - **Mitigation:** Coordinate - T-13 uses `/events` root, T-18 uses `/events/:id/photos`
   - Both can be registered to same router, or merge after both PRs

2. **`packages/db/src/schema/` tables**
   - Schema is stable from T-1
   - Low conflict risk

---

## 9. Implementation Checklist

### Must Do
- [ ] Verify event ownership BEFORE querying photos
- [ ] Use `requirePhotographer()` middleware
- [ ] Use cursor-based pagination with `uploaded_at`
- [ ] Limit max 50 photos per request
- [ ] Validate `eventId` is valid UUID
- [ ] Validate `cursor` is valid ISO datetime (if provided)
- [ ] Validate `limit` is between 1-50

### Should Do
- [ ] Return consistent error responses (`{ error: { code, message } }`)
- [ ] Include `status` field in response
- [ ] Use 15-minute expiry for presigned URLs
- [ ] Use exact CF Images transform URL format from research doc

### Could Do
- [ ] Add response time logging
- [ ] Add cache headers (short TTL, user-specific)

---

## 10. Test Cases

### Unit Tests
1. **Pagination:** Returns correct subset with cursor
2. **Next cursor:** Correctly calculates next cursor from last item
3. **HasMore flag:** Accurately determines if more photos exist
4. **Limit validation:** Rejects limit > 50
5. **Cursor validation:** Rejects invalid datetime format
6. **URL generation:** Generates correct CF Images transform URLs
7. **Presigned URL:** Generates valid R2 presigned URL

### Integration Tests
1. **Auth:** Unauthenticated → 401
2. **Ownership:** Different photographer's event → 404
3. **Non-existent event:** Invalid event ID → 404
4. **Empty event:** No photos → empty array with pagination
5. **Full pagination:** Cursor works across multiple pages

---

## 11. Open Questions for Human Decision

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | R2 presigned URL method | `signUrl` vs `presign` | Implementation code |
| 2 | Pagination response format | Nested vs flat | API contract |
| 3 | Include `downloadUrl` or only thumbnail/preview | Yes (per spec) vs No | API response size |

**Recommendations:**
1. **R2 method:** Validate against Cloudflare docs (implementv3 will verify)
2. **Pagination format:** Use nested `{ data, pagination: {...} }`
3. **downloadUrl:** Include per spec (15-minute presigned URL)

---

## Summary

| Category | Item | Status |
|----------|------|--------|
| **[RISK]** | Authorization leakage | Mitigated - verify ownership |
| **[RISK]** | Invalid cursor format | Mitigated - Zod datetime validation |
| **[NEED_VALIDATION]** | R2 presigned URL method | Check Cloudflare docs |
| **[NEED_VALIDATION]** | R2 custom domain configured | Verify in Cloudflare dashboard |
| **[GAP]** | Pagination response format | Resolved - use nested format |
| **[GAP]** | Events without photos | Handled - empty array response |

---

## Provenance

**Files read:**
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/tasks.md` - Task definition
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/plan/final.md` - Execution plan
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/research/cf-images-thumbnails.md` - CF Images research
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/photos.ts` - Schema
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/events.ts` - Schema
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/dashboard/route.ts` - Route pattern
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/middleware/require-photographer.ts` - Auth pattern
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/wrangler.jsonc` - R2 configuration
