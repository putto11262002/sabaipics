# Upstream Dossier

Task: `T-19 — Upload dropzone + Gallery UI`
Root: `BS_0001_S-1`
Date: `2026-01-11`

## Task definition

- **ID:** T-19
- **Title:** Upload dropzone + Gallery UI
- **Type:** feature
- **Surface:** UI
- **Story refs:** US-7 (Photo upload), US-9 (Event gallery)
- **Dependencies:** T-16 (Upload API), T-18 (Gallery API)
- **Scope:** `apps/dashboard/src/routes/events/[id]/`, `apps/dashboard/src/components/`

### Acceptance criteria

- Drag-and-drop + file picker for photo uploads
- Client-side validation (format, size) with clear errors
- Per-file upload progress tracking
- Processing status badges (processing, indexed)
- Gallery grid with thumbnails (lazy loading)
- Click photo → lightbox with 1200px preview
- Download button in lightbox
- Face count badges on thumbnails

### Tests

- Component tests for dropzone
- Component tests for gallery grid
- Test validation error messages

### Rollout/Risk

- Medium risk (UX critical)
- Test on slow connections
- Test on mobile

## Upstream plan context

### Key approach (from final.md)

**US-7 Upload Flow (client-side):**
1. UI: Drag photos or file picker
2. UI: Client validation (format, size ≤ 20MB)
3. API: `POST /events/:id/photos`
4. UI: Show "Processing..." badge

**US-9 Gallery Display:**
1. UI: Open event detail
2. API: `GET /events/:id/photos?cursor=X&limit=50`
3. UI: Grid with CF Images thumbnails (400px)
4. UI: Click → lightbox (1200px preview)
5. UI: Download → presigned R2 URL (4000px JPEG)

**URL structure for images:**
```
Thumbnail: /cdn-cgi/image/width=400,fit=cover,format=auto/photos.sabaipics.com/{r2_key}
Preview:   /cdn-cgi/image/width=1200,fit=contain,format=auto/photos.sabaipics.com/{r2_key}
Download:  Presigned R2 URL (normalized JPEG, ~4000px)
```

### Validation constraints

**Client-side validation requirements:**
- Accepted formats: JPEG, PNG, HEIC, WebP (no RAW)
- Max size: 20 MB
- Clear error messages for rejection

**Error messages (from final.md):**
| Error | Message |
|-------|---------|
| Wrong format | "Accepted formats: JPEG, PNG, HEIC, WebP" |
| Too large | "Maximum file size is 20MB" |
| No credits | "Insufficient credits. Purchase more to continue." |
| Event expired | "This event has expired" |

### Gallery API contract (from T-18)

**Endpoint:** `GET /events/:id/photos`

**Response shape:**
```typescript
{
  photos: Array<{
    id: string;
    thumbnailUrl: string;    // 400px (CF Images transform)
    previewUrl: string;      // 1200px (CF Images transform)
    downloadUrl: string;     // Presigned R2 URL (4000px JPEG)
    faceCount: number;
    status: "processing" | "indexed";
  }>;
  cursor?: string;           // Next page cursor
}
```

**Pagination:**
- Cursor-based
- Limit: 50 photos per page
- Sorted by uploaded_at desc

### Upload API contract (from T-16)

**Endpoint:** `POST /events/:id/photos`

**Request:** multipart/form-data (file)

**Response:**
```typescript
{
  photoId: string;
  status: "processing";
}
```

**Error responses:**
- 400: Validation errors (format, size, expired event)
- 402: Insufficient credits
- 404: Event not found

## Linked ADRs / research

### Research artifacts

1. **cf-upload-limits.md**
   - Max upload size: 20 MB (set at 20MB in final plan, originally researched 50MB option)
   - Allowed formats: JPEG, PNG, HEIC, WebP
   - RAW formats NOT supported by CF Images

2. **cf-images-thumbnails.md**
   - Thumbnail strategy: Cloudflare Images URL-based transformations (Option A)
   - Thumbnail URL pattern: `/cdn-cgi/image/width={size},fit=cover,format=auto/{base}/{r2_key}`
   - Two sizes: 400px (grid), 1200px (lightbox preview)
   - Face-aware cropping available via `gravity=face` parameter (optional)
   - Cost: ~$0.50/1,000 unique transformations after 5,000 free/month
   - HEIC support: Confirmed supported as input format

### Decisions (from final.md)

| # | Decision | Resolution |
|---|----------|------------|
| 2 | Image format handling | Normalize to JPEG (4000px max width) |
| 5 | Thumbnails | CF Images on-demand (400px / 1200px) |
| 15 | Storage strategy | Normalized JPEG only (no original) |
| 16 | Accepted formats | JPEG, PNG, HEIC, WebP (no RAW) |
| 17 | Max upload size | 20 MB |

## Key constraints from upstream

### Load-bearing contracts

1. **Validation (client-side):**
   - MUST check format: JPEG, PNG, HEIC, WebP only
   - MUST check size: ≤ 20 MB
   - MUST show clear error messages matching spec (see table above)

2. **Upload API integration:**
   - Endpoint: `POST /events/:id/photos`
   - Content-Type: multipart/form-data
   - Response includes photoId + status="processing"
   - MUST handle 402 error (insufficient credits) distinctly

3. **Gallery API integration:**
   - Endpoint: `GET /events/:id/photos?cursor={cursor}&limit=50`
   - MUST handle cursor-based pagination
   - Response includes thumbnailUrl, previewUrl, downloadUrl (three distinct URLs)
   - MUST display face count badges from faceCount field
   - MUST show status badges (processing vs indexed)

4. **Image URL structure:**
   - Thumbnail (grid): Use thumbnailUrl from API (400px via CF Images)
   - Preview (lightbox): Use previewUrl from API (1200px via CF Images)
   - Download: Use downloadUrl from API (presigned R2 URL, full 4000px JPEG)

5. **Performance:**
   - MUST use lazy loading for thumbnails (`loading="lazy"`)
   - Target: <2s p95 load time (inherited from US-9 DoD)

### Gaps and uncertainties

1. `[NEED_DECISION]` Exact thumbnail dimensions for grid (400px mentioned, but exact grid layout not specified)
2. `[NEED_DECISION]` Whether to use `gravity=face` for thumbnail cropping (optional feature available)
3. `[NEED_VALIDATION]` Upload progress tracking mechanism (per-file progress bar or batch progress?)
4. `[NEED_VALIDATION]` Dropzone library choice (not specified in plan)
5. `[NEED_VALIDATION]` Lightbox library choice (not specified in plan)
6. `[GAP]` Empty state messaging for new events with 0 photos
7. `[GAP]` Max concurrent uploads allowed (not specified)
8. `[GAP]` Behavior when uploading to expired event (client-side check needed?)
9. `[GAP]` Retry behavior on failed uploads (manual retry only, or auto-retry?)

### Implied non-functional requirements

1. **Mobile-first:** Test on mobile (Thai market is mobile-heavy per context)
2. **Slow connections:** Test upload progress on slow connections (rollout/risk notes this)
3. **File picker accessibility:** Must work with both drag-and-drop and traditional file picker
4. **Thai language:** Error messages should be i18n-ready (not specified but market is Thai)

### Dependencies status (from tasks.md)

- **T-16 (Upload API):** [x] Done (PR #24)
- **T-18 (Gallery API):** [x] Done (PR #23)

Both dependencies are COMPLETE. T-19 can proceed with implementation.

## Notes

- This is a UI-only task; all backend contracts are fixed and implemented
- Client-side validation MUST match server-side rules to avoid confusing errors
- Three distinct image URLs serve different purposes (grid/lightbox/download)
- Status badges required: "processing" and "indexed" (or equivalent visual indicator)
- Face count badges on thumbnails are acceptance criteria (must be visible without opening lightbox)
