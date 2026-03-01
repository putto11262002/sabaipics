# Logs Scout

Task: `T-19 — Upload dropzone + Gallery UI`
Root: `BS_0001_S-1`
Date: `2026-01-11`

## Patterns observed (carry forward)

### UI Architecture (from T-6, T-11, T-12, T-15)

**React Query Hook Pattern:**

- Custom hooks live in `apps/dashboard/src/hooks/<domain>/use<Action>.ts`
- Standard mutation pattern with `onSuccess` query invalidation
- Examples: `useDashboardData.ts`, `useCreditPackages.ts`, `useConsentStatus.ts`, `useCreateEvent.ts`

```typescript
export function useUploadPhoto() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: FormData) => {
      const token = await apiClient.getToken();
      const res = await fetch(`${apiUrl}/events/${eventId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: data,
      });
      // ... error handling
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos', eventId] });
    },
  });
}
```

**shadcn Component Usage:**

- Dialog: Modal overlays (T-6, T-15 pattern)
- Card: Grid layouts (T-11 dashboard, T-12 packages)
- Button: Loading states with spinner (all UI tasks)
- Alert: Error/warning messages with retry (T-11, T-12)
- Skeleton: Loading placeholders (T-11)
- Tooltip: Disabled state explanations (T-11)

**Error Handling Pattern:**

- Try-catch with Alert components showing user-friendly messages
- Retry buttons for network failures
- Field-level validation errors for forms
- Generic fallback for unknown errors

**Loading States:**

- Skeleton components during initial load (T-11 pattern)
- Button spinners during mutations (T-6, T-12, T-15 pattern)
- Disabled states to prevent double-submissions

### API Integration Patterns (from T-16, T-18)

**Photo Upload API (T-16):**

- Endpoint: `POST /events/:id/photos`
- Content-Type: `multipart/form-data` (FormData)
- Authorization: `Bearer <token>` (requirePhotographer middleware)
- Request: File upload (≤ 20MB, JPEG/PNG/HEIC/WebP)
- Response (201):
  ```typescript
  {
    data: {
      id: string,
      status: "processing",
      uploadedAt: string
    }
  }
  ```
- Error responses:
  - 400: Validation (format, size, missing file)
  - 402: Insufficient credits (`INSUFFICIENT_CREDITS`)
  - 403: Event expired (`EVENT_EXPIRED`)
  - 404: Event not found (`NOT_FOUND`)
  - 500: Normalization/R2/Queue failures

**Gallery API (T-18):**

- Endpoint: `GET /events/:id/photos?cursor=X&limit=50`
- Authorization: `Bearer <token>`
- Response (200):
  ```typescript
  {
    data: [{
      id: string,
      thumbnailUrl: string,  // CF Images 400px
      previewUrl: string,    // CF Images 1200px
      downloadUrl: string,   // Presigned R2 URL (15 min)
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
- Cursor-based pagination using `uploaded_at`
- Max limit: 50 photos per page
- Sorted by `uploaded_at` desc

**Authentication Flow:**

- All protected endpoints require Bearer token from Clerk
- Middleware chain: `requirePhotographer()` enforces auth + photographer existence
- Event ownership verified server-side (photographer_id check)
- 401: Unauthenticated
- 403: No consent OR wrong photographer
- 404: Event not found (used instead of 403 to prevent enumeration)

### Data Contracts (from T-1, T-13, T-16, T-18)

**Photo Status Lifecycle:**

1. Upload API creates photo with `status: "processing"`
2. Queue consumer (T-17) updates to `status: "indexed"` or `status: "failed"`
3. Gallery API returns current status for badge display

**Credit Deduction (from T-16):**

- Upload requires 1 credit per photo
- FIFO deduction with expiry inheritance
- Transaction includes: credit check → deduction → photo record creation
- Post-deduction failure points: 2 (normalization/R2 upload, queue enqueue)

**File Validation Rules (from T-16):**

- Formats: JPEG, PNG, HEIC, WebP only
- Max size: 20MB
- Normalization: Converts to JPEG (4000px max, 90% quality)
- R2 storage: Single normalized JPEG at `{eventId}/{photoId}.jpg`

**CF Images Transform URLs (from T-18):**

- Thumbnail: `/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/{r2_base_url}/{r2_key}`
- Preview: `/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/{r2_base_url}/{r2_key}`
- Download: Presigned R2 URL (15-minute expiry)

### Component Organization (from T-6, T-11, T-15)

**File Locations:**

- Routes: `apps/dashboard/src/routes/<path>/index.tsx`
- Hooks: `apps/dashboard/src/hooks/<domain>/use<Action>.ts`
- Components (shared): `apps/dashboard/src/components/<category>/<Component>.tsx`
- Shared UI library: `packages/ui/src/components/<component>.tsx`

**T-19 Expected Structure:**

- Route: `apps/dashboard/src/routes/events/[id]/index.tsx` (or `gallery.tsx` nested route)
- Hooks:
  - `apps/dashboard/src/hooks/photos/useUploadPhoto.ts` (mutation)
  - `apps/dashboard/src/hooks/photos/usePhotos.ts` (query with pagination)
- Components:
  - `apps/dashboard/src/components/photos/PhotoUploadDropzone.tsx`
  - `apps/dashboard/src/components/photos/PhotoGalleryGrid.tsx`
  - `apps/dashboard/src/components/photos/PhotoLightbox.tsx`
  - `apps/dashboard/src/components/photos/PhotoStatusBadge.tsx`

---

## Constraints from prior work

### API Constraints (non-negotiable)

**From T-16 (Upload API):**

1. **File upload must use FormData** - API expects `multipart/form-data`
2. **Max file size: 20MB** - Client must validate before upload to avoid unnecessary API calls
3. **Allowed formats: JPEG, PNG, HEIC, WebP** - Reject other formats client-side
4. **Credit deduction is atomic** - Once photo record created, credit is deducted (cannot refund)
5. **Post-deduction failures possible** - Normalization or R2 upload may fail after credit deduction
6. **Event expiry enforcement** - Upload rejected if event expired (403 error)

**From T-18 (Gallery API):**

1. **Cursor pagination required** - Use `cursor` + `limit` params, no offset pagination
2. **Max limit: 50 photos** - API enforces this, client should respect
3. **Download URLs expire in 15 minutes** - Must re-fetch if user returns to lightbox later
4. **Ownership verified server-side** - No client-side auth logic needed

### UI/UX Constraints (from prior tasks)

**From T-11, T-12 (Dashboard/Credit UX):**

1. **No UI test infrastructure** - Cannot write automated tests (Vitest not configured)
   - Must document manual test cases thoroughly
   - Rely on TypeScript + build checks

2. **Bundle size awareness** - Dashboard already at 549 kB
   - Avoid large image libraries (use native browser APIs where possible)
   - Consider lazy loading for heavy components (lightbox)

**From T-6, T-15 (Modal patterns):**

1. **Loading states mandatory** - All mutations must show loading indicator
2. **Error states with retry** - Network failures must offer retry button
3. **Disabled states during operations** - Prevent double-submissions

**From T-11 (Responsive design):**

1. **Mobile-first** - Thai users primarily mobile
2. **Touch-friendly targets** - Buttons must be tappable
3. **Responsive grids** - Use `md:grid-cols-2 lg:grid-cols-3` pattern

### Data Constraints

**From T-1 (Database schema):**

1. **UUIDs for all IDs** - Photo IDs are UUIDs, not integers
2. **Timestamps are ISO8601 strings** - All dates from API are strings with timezone

**From T-16 (Upload flow):**

1. **Upload is async** - Photo status starts as "processing", face detection happens in background
2. **No duplicate prevention** - Same file can be uploaded multiple times (by design)
3. **No upload cancellation** - Once credit deducted, upload must complete

**From T-18 (Gallery data):**

1. **Face count may be 0** - Photos without faces are valid
2. **Status may be "failed"** - UI must handle failed processing gracefully
3. **Pagination cursor is timestamp** - Use `uploadedAt` field from last photo

---

## Known issues / follow-ups relevant to T-19

### From T-16 (Upload API)

**`[KNOWN_LIMITATION]` Test Coverage:**

- Unit tests fail due to Hono testClient FormData limitations
- All tests return 400 instead of expected status codes
- Recommendation: Manual testing with real HTTP client
- **Impact on T-19**: Cannot rely on API integration tests, must test manually

**`[KNOWN_LIMITATION]` Normalization Uses Temp R2:**

- `normalizeImage()` uses temporary R2 storage (not truly in-memory)
- Two R2 writes per upload (temp for normalization + final)
- **Impact on T-19**: No client impact, but explains potential latency

**`[ENG_DEBT]` Post-Deduction Refund Process:**

- No refund mechanism if normalization/R2/queue fails after credit deduction
- **Impact on T-19**: UI should clearly indicate upload is in progress (no guarantees until success response)

**`[ENG_DEBT]` Rate Limiting Policy:**

- No rate limiting on upload endpoint
- **Impact on T-19**: Client should implement throttling (e.g., max 5 concurrent uploads)

**`[ENG_DEBT]` Idempotency Strategy:**

- No idempotency key support
- **Impact on T-19**: Avoid retry on 402 (insufficient credits) or 403 (expired event)

### From T-18 (Gallery API)

**No follow-ups impacting T-19** - Gallery API is straightforward, no known issues.

### From T-11, T-12 (Dashboard UI)

**`[KNOWN_LIMITATION]` Webhook Timing:**

- Credits may take 1-5 seconds to appear after Stripe payment (T-10 webhook)
- **Impact on T-19**: After credit purchase, user may see "Insufficient credits" briefly
- **Mitigation**: T-11 has manual refresh button + auto-refresh on window focus

**`[KNOWN_LIMITATION]` No UI Test Infrastructure:**

- Vitest not configured in dashboard
- **Impact on T-19**: Must document manual test cases, cannot write automated tests

### From T-15 (Events UI)

**`[PM_FOLLOWUP]` Event Detail View Integration:**

- Event creation modal implemented, but event detail view may need upload integration
- **Impact on T-19**: Confirm routing - does upload live on event detail page or separate route?

---

## Testing patterns

### Manual Testing Approach (from T-11, T-12, T-16)

Since UI tests cannot be automated, follow this pattern:

**Pre-merge checklist structure:**

```markdown
### Upload Flow

- [ ] Desktop: Drag-and-drop works
- [ ] Desktop: File picker works
- [ ] Mobile Safari: File picker works (camera option)
- [ ] Mobile Chrome: File picker works (camera option)
- [ ] Validation: Reject invalid format (e.g., .pdf)
- [ ] Validation: Reject oversized file (>20MB)
- [ ] Upload: Show progress indicator
- [ ] Upload: Show success state
- [ ] Upload: Show error state with retry
- [ ] Insufficient credits: Show error, link to buy credits
- [ ] Expired event: Show error, no retry

### Gallery Flow

- [ ] Desktop: Grid layout responsive (2-3 columns)
- [ ] Mobile: Grid stacks properly (1-2 columns)
- [ ] Thumbnails: Load lazily (not all at once)
- [ ] Click photo: Opens lightbox with preview
- [ ] Lightbox: Download button works
- [ ] Lightbox: Close button works
- [ ] Lightbox: Keyboard navigation (ESC to close)
- [ ] Face count badges: Display correctly
- [ ] Status badges: Show processing/indexed/failed
- [ ] Pagination: Load more works (cursor-based)
- [ ] Empty state: Show when no photos
```

### Build Validation (from all UI tasks)

```bash
# Type check (mandatory)
pnpm --filter=@sabaipics/dashboard check-types

# Production build (mandatory)
pnpm --filter=@sabaipics/dashboard build

# Dev mode (for manual testing)
pnpm dev
```

### API Integration Testing (from T-16, T-18)

**Upload API:**

```bash
# Test with real file (after API deployed)
curl -X POST "http://localhost:8787/events/{eventId}/photos" \
  -H "Authorization: Bearer {token}" \
  -F "file=@test.jpg"

# Test validation errors
curl -X POST "http://localhost:8787/events/{eventId}/photos" \
  -H "Authorization: Bearer {token}" \
  -F "file=@test.pdf"  # Should return 400
```

**Gallery API:**

```bash
# Test pagination
curl "http://localhost:8787/events/{eventId}/photos?limit=10" \
  -H "Authorization: Bearer {token}"

# Test with cursor
curl "http://localhost:8787/events/{eventId}/photos?cursor=2026-01-11T12:00:00Z&limit=10" \
  -H "Authorization: Bearer {token}"
```

### Error Simulation (from T-11, T-12)

**Network errors:**

- Kill API server → verify error alert + retry works
- Throttle network → verify upload progress tracking

**API errors:**

- Upload with 0 credits → verify 402 handling
- Upload to expired event → verify 403 handling
- Upload invalid format → verify 400 handling

---

## Implementation Recommendations

### Phase 1: Upload Dropzone

**Required shadcn components:**

- Button (already added)
- Alert (already added)
- Card (already added)
- Progress (may need to add via CLI)

**Third-party libraries (consider):**

- `react-dropzone` - Popular drag-and-drop library (40KB gzipped)
- OR native HTML5 drag-and-drop (zero bundle cost)

**Validation logic:**

```typescript
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
const MAX_SIZE_MB = 20;

function validateFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Invalid format. Use JPEG, PNG, HEIC, or WebP.' };
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return { valid: false, error: `File too large. Max ${MAX_SIZE_MB}MB.` };
  }
  return { valid: true };
}
```

**Upload progress tracking:**

```typescript
// Use XMLHttpRequest for progress events (fetch doesn't support)
const xhr = new XMLHttpRequest();
xhr.upload.addEventListener('progress', (e) => {
  const percent = (e.loaded / e.total) * 100;
  setProgress(percent);
});
```

### Phase 2: Gallery Grid

**Required shadcn components:**

- Card (already added)
- Badge (may need to add)
- Skeleton (already added)
- Dialog (already added - for lightbox)

**Image loading strategy:**

- Use `loading="lazy"` for thumbnails
- Intersection Observer for "Load More" pagination trigger
- Placeholder blur while loading (low-quality image placeholder)

**Grid layout (follow T-11 pattern):**

```typescript
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  {photos.map(photo => <PhotoCard key={photo.id} photo={photo} />)}
</div>
```

### Phase 3: Lightbox

**Functionality:**

- Click thumbnail → open lightbox with 1200px preview
- Download button → fetch presigned URL (may be expired, re-fetch if needed)
- Keyboard navigation: ESC to close, arrow keys for next/prev (future)
- Close on backdrop click

**Bundle size consideration:**

- Avoid heavy lightbox libraries (e.g., react-image-lightbox is 200KB)
- Use shadcn Dialog + custom styling (lighter weight)

---

## Files Scanned

- `/docs/logs/BS_0001_S-1/implementation/T-1/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-1/summary/iter-002.md`
- `/docs/logs/BS_0001_S-1/implementation/T-6/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-10/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-11/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-13/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-15/context/logs-scout.md`
- `/docs/logs/BS_0001_S-1/implementation/T-16/summary/iter-002.md`
- `/docs/logs/BS_0001_S-1/implementation/T-18/context/upstream-dossier.md`
- `/docs/logs/BS_0001_S-1/implementation/T-18/context/logs-scout.md`
- `/docs/logs/BS_0001_S-1/tasks.md`

---

**End of Logs Scout Report**
