# Implementation Plan

Task: `T-19 — Upload dropzone + Gallery UI`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-12`
Owner: `Claude (implementv3)`

## Inputs
- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: `T-19`)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-19/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-19/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-19/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-19/context/codebase-exemplars.md`

## Goal / non-goals

### Goal
Implement photographer-facing UI for uploading event photos and viewing the gallery, enabling US-7 (Photo upload) and US-9 (Event gallery).

### Non-goals
- Photo search/filtering (future enhancement)
- Bulk download (future enhancement)
- Photo editing/cropping (future enhancement)
- Guest-facing photo access (separate user story)
- Automated tests (no UI test infrastructure exists per logs-scout.md)

## Approach (data-driven)

### Architecture
Four-component system integrated into existing event detail page:

1. **Upload dropzone** — Drag-and-drop + file picker with client-side validation
2. **Upload queue card** — Temporary UI showing upload progress/status (appears during uploads, auto-hides after completion)
3. **Gallery grid** — Thumbnail grid with lazy loading and cursor-based pagination
4. **Lightbox dialog** — Full-size preview with download action

### UI Flow Path

**State 1: Initial / Empty**
- Upload dropzone (prominent, "Drag photos or click to browse")
- Empty state below ("No photos yet")

**State 2: Files Selected → Upload Queue Appears**
- Upload dropzone (collapses to smaller "Add more" button)
- **Upload queue card** (shows file list with status: uploading/success/error)
  - Format: Card with list of files
  - Each file shows: icon, filename, status badge, retry button (if error)
  - Example: "✓ photo1.jpg - Uploaded", "⏳ photo2.jpg - Uploading...", "❌ photo3.pdf - Invalid format [Retry]"
- Gallery grid (live updates as uploads complete)

**State 3: All Uploads Complete → Queue Auto-Hides**
- Upload dropzone (returns to normal size)
- Upload queue card (auto-hides after 3 seconds)
- Gallery grid (shows all photos including new ones)

### Technology choices (grounded in exemplars)

**Component library:**
- Use existing shadcn/ui components: `Dialog`, `Card`, `Button`, `Alert`, `Skeleton`, `Badge`
- `[NEED_DECISION]` Add `Progress` component for upload status (not currently in packages/ui)
- Pattern: Follow `CreateEventModal.tsx` (exemplar 1) for modal structure
- Pattern: Follow `events/index.tsx` (exemplar 3) for loading/error/empty states
- Pattern: Follow `credits/packages/index.tsx` (exemplar 4) for responsive grid

**Drag-and-drop:**
- `[NEED_DECISION]` **Option A (recommended):** Native HTML5 drag-and-drop API
  - Pros: Zero bundle cost, sufficient for use case, browser-native
  - Cons: More boilerplate code, less polished UX
- `[NEED_DECISION]` **Option B:** `react-dropzone` library (40KB gzipped)
  - Pros: Better UX, handles edge cases, file rejection UI built-in
  - Cons: Adds bundle size (dashboard already 549KB per logs-scout.md)
- **Recommendation:** Start with native HTML5, evaluate if UX issues arise during testing

**Lightbox:**
- `[NEED_DECISION]` **Option A (recommended):** Custom implementation using shadcn `Dialog`
  - Pros: Minimal bundle size, full control, consistent with app styling
  - Cons: Need to implement keyboard navigation manually
- `[NEED_DECISION]` **Option B:** `yet-another-react-lightbox` (~30KB)
  - Pros: Full-featured (zoom, keyboard nav, thumbnails)
  - Cons: Bundle size, may be overkill for MVP
- **Recommendation:** Use shadcn Dialog for MVP (follows exemplar 1 pattern)

**Upload progress tracking:**
- `[NEED_VALIDATION]` **Option A (recommended):** React Query mutation status only
  - Show "uploading" → "processing" → "indexed" states based on API response
  - No real-time progress bar (simpler, sufficient for 20MB max files)
- `[NEED_VALIDATION]` **Option B:** XMLHttpRequest with progress events
  - Show actual % uploaded (0-100%)
  - More complex, better UX on slow connections
- **Recommendation:** Start with Option A (mutation status), add progress bar if user feedback requires it

### File organization (follows tech-docs.md conventions)

**New files to create:**
```
apps/dashboard/src/
├── hooks/photos/
│   ├── usePhotos.ts           # GET /events/:id/photos (paginated)
│   └── useUploadPhoto.ts      # POST /events/:id/photos (single file)
├── components/photos/
│   ├── PhotoUploadZone.tsx    # Dropzone + file validation
│   ├── UploadQueueCard.tsx    # Upload progress list (NEW: shows file upload status)
│   ├── PhotoGalleryGrid.tsx   # Grid with thumbnails + pagination
│   ├── PhotoLightbox.tsx      # Dialog with preview + download
│   └── PhotoStatusBadge.tsx   # "Processing" / "Indexed" badge
└── routes/events/[id]/
    └── index.tsx              # MODIFY: Add Photos tab + components
```

### Implementation phases

**Phase 1: API hooks** (foundation)
1. Create `usePhotos` hook with cursor-based pagination (pattern: exemplar 6)
2. Create `useUploadPhoto` hook with FormData handling (pattern: exemplar 2)
3. Add TypeScript types for Photo entity matching API contract

**Phase 2: Upload dropzone + queue**
1. Create `PhotoUploadZone` component with:
   - File input (`accept="image/jpeg,image/png,image/heic,image/webp"`)
   - Drag-and-drop handlers (native HTML5 API)
   - Client-side validation (format, 20MB limit) matching upstream-dossier.md spec
   - Callback: `onFilesSelected(files)` triggers queue update
   - Visual state: Normal (prominent) → Collapsed (during uploads) → Normal (after completion)
2. Create `UploadQueueCard` component with:
   - File list display (icon, filename, status badge)
   - Status tracking: "Queued" → "Uploading" → "Uploaded" | "Failed"
   - Inline error display with "Retry" button for failed uploads
   - Auto-hide behavior: Dismiss after 3 seconds once all uploads complete
   - Manual dismiss: X button in card header
   - Max concurrent uploads: 5 (queue remaining files)
3. Upload state management:
   - Local state for upload queue: `{ id, file, status, error }`
   - Trigger `useUploadPhoto` mutation per file
   - Update queue status based on mutation state
   - Remove from queue or mark complete when done

**Phase 3: Gallery grid**
1. Create `PhotoGalleryGrid` component with:
   - Responsive grid layout (`grid gap-4 md:grid-cols-2 lg:grid-cols-3` per exemplar 4)
   - Lazy loading (`loading="lazy"` on `<img>` tags)
   - Cursor-based "Load More" button (pattern: exemplar 5 API contract)
   - Skeleton loading states (pattern: exemplar 3)
2. Create `PhotoStatusBadge` component:
   - "Processing" → yellow badge with spinner
   - "Indexed" → green badge with checkmark
   - "Failed" → red badge with warning icon
3. Face count display: Badge overlay on thumbnail (e.g., "3 faces" with icon)
4. `[NEED_VALIDATION]` Grid dimensions: Use `aspect-square` for consistent thumbnail layout

**Phase 4: Lightbox**
1. Create `PhotoLightbox` component using shadcn `Dialog`:
   - Display `previewUrl` (1200px) in dialog content
   - Download button fetches `downloadUrl` (presigned R2 URL)
   - ESC key to close (built into Dialog component)
   - Click outside to close (built into Dialog component)
2. `[NEED_VALIDATION]` Download URL expiry: Re-fetch photo data if download fails (15-minute expiry per logs-scout.md)

**Phase 5: Integration**
1. Modify `apps/dashboard/src/routes/events/[id]/index.tsx`:
   - Add "Photos" tab to existing event detail view
   - Mount `PhotoUploadZone` at top
   - Mount `PhotoGalleryGrid` below
2. Wire up query invalidation: Upload success → refetch gallery

**Phase 6: Empty states and error handling**
1. `[GAP]` Empty state for new events: **Propose:** "No photos yet. Upload photos to get started."
2. Error states:
   - 402 Insufficient credits → Alert with link to `/credits/packages`
   - 403 Event expired → Alert with no retry (per upstream-dossier.md)
   - 400 Validation errors → Inline error per file
   - Network errors → Alert with "Try again" button (pattern: exemplar 3)
3. `[GAP]` Retry behavior: **Propose:** Manual retry only (show "Try again" button), no auto-retry to avoid credit double-deduction

## Contracts (only if touched)

### API (already implemented, no changes)

**Upload API (T-16):**
- `POST /events/:eventId/photos`
- Request: `multipart/form-data` with `file` field
- Response: `{ data: { id, status: "processing" } }`
- Errors: 400 (validation), 402 (credits), 403 (expired), 404 (not found)

**Gallery API (T-18):**
- `GET /events/:eventId/photos?cursor=<timestamp>&limit=<number>`
- Response: `{ data: Photo[], pagination: { nextCursor, hasMore } }`
- Photo shape: `{ id, thumbnailUrl, previewUrl, downloadUrl, faceCount, status, uploadedAt }`

### DB
No database changes (backend APIs complete).

### Jobs/events
No changes (T-17 Rekognition consumer handles async indexing).

## Success path

1. Photographer navigates to event detail page (`/events/:id`)
2. Sees "Photos" tab with upload dropzone
3. Drags 10 photos into dropzone OR clicks "Choose files"
4. Client validates format and size, rejects 1 invalid file with inline error
5. Uploads 9 valid files concurrently (max 5 at a time per gap resolution)
6. Each file shows "Uploading..." → "Processing..." states
7. Gallery grid updates with new thumbnails (status badge: "Processing")
8. After ~10 seconds (T-17 indexing), photos update to "Indexed" with face count badges
9. Photographer clicks thumbnail → lightbox opens with 1200px preview
10. Clicks "Download" → browser downloads 4000px JPEG via presigned URL
11. Scrolls to bottom → clicks "Load More" → fetches next page via cursor

## Failure modes / edge cases (major only)

### Upload failures
1. **Insufficient credits (402):**
   - Show Alert: "Insufficient credits. Purchase more to continue."
   - Include link/button to `/credits/packages` route
   - No retry (credit check is deterministic)
2. **Event expired (403):**
   - Show Alert: "This event has expired and cannot accept new photos."
   - No retry (expired state is permanent)
3. **Network failure during upload:**
   - Show Alert with "Try Again" button
   - Retry sends new request (no idempotency, risk of double-charge noted in logs-scout.md)
4. **File too large (client-side rejection):**
   - Show inline error: "Maximum file size is 20MB"
   - Do not attempt upload
5. **Invalid format (client-side rejection):**
   - Show inline error: "Accepted formats: JPEG, PNG, HEIC, WebP"
   - Do not attempt upload

### Gallery failures
1. **Network failure on load:**
   - Show Alert with "Try Again" button (pattern: exemplar 3)
2. **Download URL expired (15 minutes):**
   - Re-fetch photo data before download
   - If re-fetch fails, show error and ask to refresh page
3. **Photo status = "failed":**
   - Show red badge: "Processing failed"
   - No retry action (requires backend investigation)

### Edge cases
1. **Zero photos uploaded:**
   - Show empty state: Icon + "No photos yet" + "Upload photos to get started"
2. **Pagination at end:**
   - Hide "Load More" button when `hasMore: false`
3. **Concurrent uploads exceed limit:**
   - Queue remaining uploads (5 concurrent max per gap resolution)
4. **User navigates away during upload:**
   - Uploads continue (no cancellation per logs-scout.md constraint)
   - Query invalidation on success ensures fresh data on return

## Validation plan

### Manual tests (no UI test infrastructure)

**Upload flow:**
- [ ] Desktop Chrome: Drag-and-drop 3 photos → uploads succeed
- [ ] Desktop Safari: File picker → uploads succeed
- [ ] Mobile Safari: File picker opens camera option → upload succeeds
- [ ] Mobile Chrome: File picker opens camera option → upload succeeds
- [ ] Client validation: Drag PDF → shows "Invalid format" error, no upload
- [ ] Client validation: Drag 25MB file → shows "File too large" error, no upload
- [ ] Multiple files: Upload 10 photos → max 5 concurrent, queue works
- [ ] Insufficient credits: Upload with 0 credits → shows 402 error with link to buy
- [ ] Expired event: Upload to expired event → shows 403 error, no retry
- [ ] Network error: Kill API mid-upload → shows error with "Try Again" button

**Gallery flow:**
- [ ] Desktop: Grid shows 2-3 columns responsively
- [ ] Mobile: Grid shows 1-2 columns
- [ ] Lazy loading: Scroll triggers image loads (check Network tab)
- [ ] Status badges: "Processing" photos show yellow badge, "Indexed" show green
- [ ] Face count badges: Photos with faces show count overlay
- [ ] Empty state: New event shows "No photos yet" message
- [ ] Pagination: Click "Load More" → fetches next 50 photos via cursor
- [ ] Pagination end: "Load More" hidden when no more photos

**Lightbox flow:**
- [ ] Click thumbnail → lightbox opens with preview (1200px)
- [ ] Click "Download" → downloads 4000px JPEG
- [ ] Click backdrop → lightbox closes
- [ ] Press ESC key → lightbox closes
- [ ] Download URL expired: Re-fetch works (hard to test, may require mock)

**Error states:**
- [ ] Network failure on gallery load → shows Alert with retry
- [ ] API returns 404 for event → shows error (should not happen if auth works)

### Build validation
```bash
# Type check
pnpm --filter=@sabaipics/dashboard check-types

# Production build
pnpm --filter=@sabaipics/dashboard build

# Bundle size check (ensure no major increase from baseline 549KB)
pnpm --filter=@sabaipics/dashboard build --mode production
# Check dist/ size
```

### Commands to run
```bash
# Start dev server for manual testing
pnpm dev

# After implementation, test production build
pnpm --filter=@sabaipics/dashboard build
pnpm --filter=@sabaipics/dashboard preview
```

## Rollout / rollback

### Rollout
1. Deploy dashboard to Cloudflare Pages (command: `pnpm --filter=@sabaipics/dashboard pages:deploy`)
2. Test on staging environment with real event and photos
3. Monitor browser console for errors on mobile devices (Thai market primarily mobile)

### Rollback
- If critical UI issue: Revert PR, redeploy previous version
- No database migrations required (zero-risk rollback)
- No feature flags (all photographers see new UI immediately)

### Monitoring
- Manual smoke test: Create event → upload photo → verify appears in gallery
- User feedback: Check for upload failures via browser console logs (if users report issues)

## Open questions

### Decisions required (HI gates)

1. `[NEED_DECISION]` **Drag-and-drop library:**
   - **Recommendation:** Native HTML5 API to minimize bundle size
   - Alternative: `react-dropzone` if native UX proves insufficient during testing
   - **Impact:** Bundle size (+40KB if using library) vs. code complexity

2. `[NEED_DECISION]` **Lightbox implementation:**
   - **Recommendation:** Custom using shadcn Dialog (minimal bundle impact)
   - Alternative: `yet-another-react-lightbox` for richer features (zoom, thumbnails)
   - **Impact:** Bundle size (+30KB) vs. feature richness

3. `[NEED_DECISION]` **Upload progress tracking:**
   - **Recommendation:** Mutation status only (simpler, sufficient for 20MB files)
   - Alternative: XMLHttpRequest progress events for % complete
   - **Impact:** UX on slow connections vs. implementation complexity

4. `[NEED_DECISION]` **Add shadcn Progress component:**
   - Required for upload progress indicators (if not already in packages/ui)
   - Command: `pnpm --filter=@sabaipics/ui ui:add progress`
   - **HI approval needed:** Adding new dependency to shared UI package

### Gaps filled with proposals

5. `[GAP → PROPOSAL]` **Empty state messaging:**
   - "No photos yet. Upload photos to get started."
   - Icon: Upload icon from lucide-react

6. `[GAP → PROPOSAL]` **Max concurrent uploads:**
   - Limit: 5 concurrent uploads
   - Rationale: Balance between speed and browser/server resource usage

7. `[GAP → PROPOSAL]` **Retry behavior on upload failure:**
   - Manual retry only (user clicks "Try Again")
   - No auto-retry to avoid risk of double credit deduction (no idempotency per logs-scout.md)
   - Exception: Do not offer retry for 402 (credits) or 403 (expired) errors

### Validations needed (low-priority, can validate during implementation)

8. `[NEED_VALIDATION]` **Grid thumbnail dimensions:**
   - Proposed: `aspect-square` for consistent layout
   - Will validate visually during implementation

9. `[NEED_VALIDATION]` **Use of `gravity=face` for thumbnail cropping:**
   - Available in CF Images API (per upstream-dossier.md)
   - Proposed: Not use for MVP (thumbnails use `fit=cover` without face detection)
   - Rationale: Simpler, face detection already shown via badge overlay

10. `[NEED_VALIDATION]` **Download URL expiry handling:**
    - Proposed: Re-fetch photo data if download button clicked and URL may be expired
    - Heuristic: If more than 10 minutes since gallery loaded, re-fetch before download

## Dependencies check
- **T-16 (Upload API):** ✅ Done (PR #24)
- **T-18 (Gallery API):** ✅ Done (PR #23)
- **shadcn components:** Most available, may need to add `Progress` and verify `Badge` exists
