# Risk Scout

Task: `T-19 — Upload dropzone + Gallery UI`
Root: `BS_0001_S-1`
Date: `2026-01-11`

## Executive Summary

T-19 implements the photographer-facing upload and gallery UI for event photos. This is a **MEDIUM-HIGH RISK** task combining file upload UX, credit balance display, API integration with both upload (T-16) and gallery (T-18), and responsive image display. The primary risks center on mobile browser compatibility (Thai market = LINE in-app browser), client-side file validation, concurrent upload state management, and proper error handling for credit deduction failures.

**Key findings:**
- No existing file upload patterns in codebase (greenfield implementation)
- Mobile browser file input constraints (iOS Safari, LINE in-app browser)
- Complex state management: concurrent uploads, progress tracking, error recovery
- Credit deduction is irreversible (client must prevent accidental double uploads)
- Large image lists require pagination and virtualization for performance

---

## High-impact risks

### 1. Mobile Browser File Upload Constraints (CRITICAL)

**Risk:** File upload UI must work in LINE in-app browser (primary distribution channel in Thai market) and iOS Safari, which have significant limitations.

**Evidence from market research:**
- LINE is dominant messaging app in Thailand (>50M users)
- Event photographers share dashboard links via LINE chat
- LINE in-app browser is WebKit-based but has restricted APIs
- iOS Safari has strict security policies on file access

**Specific limitations:**

| Browser | Limitation | Impact | Workaround |
|---------|------------|--------|------------|
| iOS Safari | No drag-and-drop on iOS < 15 | Dropzone falls back to file picker | Use `<input type="file">` as fallback |
| LINE in-app | No drag events in some versions | Dropzone may not work at all | Progressive enhancement: show file button prominently |
| iOS Safari | Camera roll access requires permission | User sees iOS permission prompt | Clear messaging: "Allow photo access" |
| Android Chrome | Some versions have drag-drop bugs | Inconsistent behavior | Always provide file button alternative |

**[HI_GATE]** Should we implement drag-and-drop at all for MVP, or just use file picker button?

**Options:**
- A) Drag-and-drop primary, file picker fallback (better desktop UX, mobile compatibility risk)
- B) File picker only (guaranteed to work, less modern UX)
- C) Feature detection: show drag-and-drop only on capable browsers

**Recommendation:** Option C (feature detection) - best of both worlds.

**Implementation pattern:**
```typescript
const isDragDropSupported = () => {
  const div = document.createElement('div');
  return (('draggable' in div) || ('ondragstart' in div && 'ondrop' in div)) 
    && 'FormData' in window 
    && 'FileReader' in window;
};

// In component
const [canDragDrop, setCanDragDrop] = useState(false);

useEffect(() => {
  setCanDragDrop(isDragDropSupported());
}, []);

// Render
{canDragDrop ? <DropZone /> : <FileButton />}
```

**Testing requirements:**
- [ ] Test file picker on iOS Safari (iPhone 13+, iOS 15+)
- [ ] Test file picker in LINE in-app browser (iOS and Android)
- [ ] Test drag-and-drop on desktop Chrome/Firefox/Safari
- [ ] Test drag-and-drop on iPad Safari
- [ ] Test multiple file selection (50+ photos)

---

### 2. Client-Side Validation vs Server Validation Gap

**Risk:** Client validates files before upload (size, format) but server re-validates. Mismatch between client and server validation logic causes confusing UX.

**Evidence from T-16 (upload API risk scout):**
- Server enforces: 20 MB max, JPEG/PNG/HEIC/WebP only
- Validation uses magic bytes (cannot be easily replicated client-side)
- Credit deducted AFTER server validation passes

**Validation gap scenarios:**

| Scenario | Client Behavior | Server Behavior | UX Impact |
|----------|----------------|-----------------|-----------|
| 21 MB JPEG | Client rejects before upload | N/A | Good (fast feedback) |
| 19 MB RAW file | Client accepts (if only checking extension) | Server rejects, no credit deducted | Bad (wasted upload time) |
| Spoofed HEIC (renamed JPEG) | Client accepts | Server might accept or reject (depends on magic bytes) | Unpredictable |
| Corrupted JPEG | Client accepts | Server rejects after normalization | Credit deducted, photo fails |

**[RISK]** Client-side validation is UX convenience only. Server is source of truth.

**Mitigation strategy:**
1. **Client-side pre-flight (best effort):**
   - Check file extension (.jpg, .jpeg, .png, .heic, .webp)
   - Check file size <= 20 MB
   - Display warnings, allow user to override
   
2. **Server error mapping:**
   - Map API error codes to user-friendly messages
   - Show which specific file failed and why
   
3. **Batch validation:**
   - Validate all selected files before starting any upload
   - Show summary: "X valid, Y will be skipped (reason)"

**Client validation implementation:**
```typescript
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

function validateFile(file: File): { valid: boolean; error?: string } {
  // Size check
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File exceeds 20 MB limit' };
  }
  
  // Extension check (not reliable, but fast)
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (ext && !ACCEPTED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: 'Unsupported file format' };
  }
  
  // MIME type check (can be spoofed, but better than nothing)
  if (!ACCEPTED_TYPES.includes(file.type)) {
    // Allow empty MIME type (happens with HEIC on some devices)
    if (file.type !== '' || !ext || !ACCEPTED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: 'Unsupported file type' };
    }
  }
  
  return { valid: true };
}
```

**[GAP]** No magic bytes detection client-side (would require reading file as ArrayBuffer). Accept that client validation is approximate.

---

### 3. Concurrent Upload State Management (HIGH COMPLEXITY)

**Risk:** Uploading 50 photos simultaneously requires tracking state per file: pending, uploading, success, error. State bugs cause UI inconsistencies, stuck uploads, lost error messages.

**State model requirements:**

```typescript
type UploadStatus = 
  | { state: 'pending' }
  | { state: 'uploading'; progress: number }
  | { state: 'success'; photoId: string }
  | { state: 'error'; message: string; retryable: boolean };

interface UploadItem {
  id: string;              // Client-generated ID
  file: File;
  status: UploadStatus;
  creditDeducted: boolean; // Track if credit was charged
}

interface UploadState {
  items: UploadItem[];
  concurrency: number;     // Max parallel uploads
  totalCredits: number;    // Current balance
}
```

**Complex scenarios:**

| Scenario | State Transitions | Edge Cases |
|----------|-------------------|------------|
| Successful upload | pending → uploading(0-100%) → success | None |
| Server validation error | pending → uploading → error (retryable=false) | Credit NOT deducted |
| R2 upload failure | pending → uploading → error (retryable=true) | Credit WAS deducted |
| Network timeout | uploading(50%) → error (retryable=true) | Uncertain if credit deducted |
| User navigates away | All pending/uploading → cancelled | Need cleanup |
| Browser crashes mid-upload | N/A | Credits may be deducted but photos not shown |

**[RISK]** If server returns 500 after credit deduction (R2 failure), client doesn't know if credit was charged. User may retry, double-charging credits.

**Mitigation:**
1. **Track credit deduction in error response:**
   ```typescript
   // API error response
   {
     error: {
       code: 'R2_UPLOAD_FAILED',
       message: 'Storage service unavailable',
       creditDeducted: true,  // <-- Critical flag
       photoId: 'uuid'        // <-- Reference for support
     }
   }
   ```

2. **Show clear UI for post-deduction failures:**
   ```
   ⚠️ Photo upload failed (credit was charged)
   [Contact Support] - Reference: photo-uuid
   Do not retry - this will charge another credit
   ```

3. **Disable retry button for post-deduction failures** to prevent double charges.

**[HI_GATE]** Should API responses include `creditDeducted` flag in error responses?

**Recommendation:** Yes, add to API contract for T-16.

---

### 4. Credit Balance Real-Time Updates

**Risk:** User's credit balance decreases with each upload. UI must reflect updated balance to prevent uploading beyond available credits.

**Current implementation:**
- Dashboard shows credit balance from `GET /dashboard` API
- No real-time updates mechanism (no WebSocket/SSE)
- Client must track balance locally during upload session

**Approaches:**

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| A) Poll `/dashboard` every 5s during upload | Simple, eventually consistent | Lag, API load | Not recommended |
| B) Optimistic update (decrement locally on success) | Instant feedback | Can desync if page refreshes | Recommended for MVP |
| C) WebSocket updates | Real-time, accurate | Complex, overkill for MVP | Future enhancement |

**Optimistic update pattern:**
```typescript
// After successful upload
const [localCredits, setLocalCredits] = useState(initialCredits);

const handleUploadSuccess = (photoId: string) => {
  setLocalCredits(prev => Math.max(0, prev - 1));
  // Also invalidate React Query cache for eventual consistency
  queryClient.invalidateQueries(['dashboard']);
};

// Show warning when credits low
{localCredits < 10 && (
  <Alert>You have {localCredits} credits remaining</Alert>
)}
```

**[RISK]** Multiple browser tabs uploading simultaneously will have desynced balance displays.

**Mitigation:** Show warning: "Upload photos from one browser tab at a time to avoid credit tracking issues."

**[GAP]** No multi-tab coordination mechanism. Accept limitation for MVP.

---

### 5. Large Image List Performance (Gallery View)

**Risk:** Displaying 500+ photos (typical wedding event) as thumbnail grid causes performance issues: slow rendering, memory pressure, scroll lag.

**Evidence from T-18 (Gallery API):**
- API returns paginated photos (cursor-based, limit 50)
- Thumbnails use CF Images transform: 400px width
- Each thumbnail URL: `/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/{r2_url}`

**Performance bottlenecks:**

| Bottleneck | Impact | Threshold | Mitigation |
|------------|--------|-----------|------------|
| DOM nodes | Layout thrashing | >500 images | Virtual scrolling |
| Image requests | Network congestion | >50 concurrent | Lazy loading + intersection observer |
| Memory (image cache) | Browser memory limit (~2 GB mobile) | >1000 images loaded | Unload off-screen images |
| React re-renders | UI lag | Every scroll event | Debounce, memo components |

**[NEED_DECISION]** Should we implement virtual scrolling for MVP, or rely on pagination + "Load More" button?

**Options:**
- A) Pagination with "Load More" button (simple, predictable)
- B) Infinite scroll (better UX, requires intersection observer)
- C) Virtual scrolling with `react-window` (best performance, added complexity)

**Recommendation:** Option B (infinite scroll) - good balance of UX and complexity.

**Implementation with Intersection Observer:**
```typescript
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = 
  useInfiniteQuery({
    queryKey: ['photos', eventId],
    queryFn: ({ pageParam }) => fetchPhotos(eventId, pageParam),
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
  });

// Sentinel element to trigger next page
const observerRef = useRef<IntersectionObserver>();
const lastElementRef = useCallback((node: HTMLElement | null) => {
  if (isFetchingNextPage) return;
  if (observerRef.current) observerRef.current.disconnect();
  
  observerRef.current = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && hasNextPage) {
      fetchNextPage();
    }
  });
  
  if (node) observerRef.current.observe(node);
}, [isFetchingNextPage, hasNextPage, fetchNextPage]);
```

**[PERF]** Image lazy loading with native browser support:
```tsx
<img 
  src={thumbnailUrl} 
  loading="lazy"  // Browser-native lazy loading
  decoding="async" // Async decode for better perceived perf
  alt={`Photo ${index}`}
/>
```

**Testing requirements:**
- [ ] Test gallery with 10 photos (fast load)
- [ ] Test gallery with 100 photos (scroll performance)
- [ ] Test gallery with 500+ photos (memory usage)
- [ ] Test on iPhone SE (low-end device)
- [ ] Test on slow 3G connection (throttle to 1 Mbps)

---

### 6. Upload Progress and Cancellation

**Risk:** Large file uploads (20 MB) take 30-60 seconds on slow connections. Without progress feedback, users think app is frozen. Without cancellation, users can't stop accidental uploads.

**Requirements:**
1. **Progress bar per file** (0-100%)
2. **Overall progress** (X of Y files uploaded)
3. **Cancel button** per file (before server processes)
4. **Pause/resume** (nice-to-have, complex)

**[RISK]** XMLHttpRequest progress events only track upload to server, not server processing time.

**Progress timeline:**
```
0%    File selected
5%    Client validation done
10%   Upload to CF Workers starts
60%   Upload to CF Workers done (xhr.upload.onprogress stops here)
???   Server normalization + R2 upload + DB insert (no progress)
100%  Server returns 200 OK
```

**User sees:** Progress bar stuck at 60% for 10-20 seconds (server processing).

**Mitigation:**
```typescript
// Fake progress after upload completes
const [progress, setProgress] = useState(0);

xhr.upload.addEventListener('progress', (e) => {
  const uploadProgress = (e.loaded / e.total) * 60; // 0-60%
  setProgress(uploadProgress);
});

xhr.addEventListener('load', () => {
  // Fake progress while waiting for response
  let fakeProgress = 60;
  const interval = setInterval(() => {
    fakeProgress += 2;
    setProgress(Math.min(fakeProgress, 95));
  }, 200);
  
  // Wait for response
  waitForResponse().then(() => {
    clearInterval(interval);
    setProgress(100);
  });
});
```

**Cancellation implementation:**
```typescript
const abortController = new AbortController();

// Upload with fetch
fetch('/api/events/:id/photos', {
  method: 'POST',
  body: formData,
  signal: abortController.signal,
});

// User clicks cancel
abortController.abort();
```

**[HI_GATE]** If user cancels after server deducts credit but before R2 upload, is credit refunded?

**Evidence from plan:** "No refund on any failure after deduction"

**Implication:** Cancel button must warn: "Credit may have been charged. Continue?"

---

### 7. Image Thumbnail Display and CF Images Integration

**Risk:** Gallery thumbnails use CF Images transform URLs. Incorrect URL format causes 404s or distorted images.

**Evidence from T-18:**
```typescript
const R2_BASE_URL = "https://photos.sabaipics.com";
const CF_DOMAIN = "https://sabaipics.com";

function generateThumbnailUrl(r2Key: string): string {
  return `${CF_DOMAIN}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${R2_BASE_URL}/${r2Key}`;
}
```

**Critical parameters:**
- `width=400` - Thumbnail size
- `fit=cover` - Crop to fill (may cut off edges)
- `format=auto` - Serve WebP to supporting browsers, JPEG fallback
- `quality=75` - Balance size/quality

**[RISK]** `fit=cover` crops images to square. For portrait/landscape photos, important content may be cut off.

**Alternative:** `fit=contain` (no cropping, shows full image with letterboxing)

**Recommendation:** Use `fit=cover` for grid thumbnails (uniform size), `fit=contain` for lightbox preview.

**Lightbox preview URL:**
```typescript
function generatePreviewUrl(r2Key: string): string {
  return `${CF_DOMAIN}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${R2_BASE_URL}/${r2Key}`;
}
```

**[NEED_VALIDATION]** Confirm R2 custom domain `photos.sabaipics.com` is configured correctly.

**CF Images error scenarios:**

| Error | Cause | UI Impact | Mitigation |
|-------|-------|-----------|------------|
| 404 Not Found | R2 key doesn't exist | Broken image icon | Show placeholder, log error |
| 403 Forbidden | R2 bucket not public | Broken image icon | Fix R2 config |
| 9413 Invalid Image | Corrupted file in R2 | Broken image icon | Mark photo as failed, notify photographer |
| 9510 Origin Unreachable | R2 service down | All images fail | Show service status banner |

**Error handling:**
```tsx
<img 
  src={thumbnailUrl}
  onError={(e) => {
    e.currentTarget.src = '/placeholder-error.png';
    logImageError(photoId, 'thumbnail_load_failed');
  }}
/>
```

---

## Hidden coupling / gotchas

### 1. Event Detail Page Integration

**Context:** T-15 (Events UI) created `/events/:id` route with tabs: Details, Statistics, Photos, Faces.

**Current state (from event detail page code):**
```tsx
<button
  disabled
  className="pb-3 text-sm font-medium text-muted-foreground opacity-50 cursor-not-allowed border-b-2 border-transparent"
>
  Photos
</button>
```

**T-19 must:**
1. Enable "Photos" tab
2. Implement tab content with upload dropzone + gallery grid
3. Maintain existing tab UI patterns (custom tabs, not Radix Tabs)

**[COUPLING]** Event detail page state management uses `useState` for active tab. T-19 must integrate without breaking existing tabs (Details, Statistics).

**Integration approach:**
```tsx
// In events/[id]/index.tsx
{activeTab === "photos" && (
  <PhotosTab 
    eventId={id} 
    photographerId={photographer.id}
  />
)}

// New component: events/[id]/_components/PhotosTab.tsx
export function PhotosTab({ eventId, photographerId }) {
  return (
    <div className="space-y-6">
      <UploadDropzone eventId={eventId} />
      <PhotoGallery eventId={eventId} />
    </div>
  );
}
```

### 2. Dashboard Credit Balance Display

**Context:** Dashboard (T-11) shows credit balance in header.

**Current implementation:**
```tsx
// From dashboard/index.tsx
const creditBalance = data.data.credits.balance;
<div className="text-2xl font-bold">{creditBalance}</div>
```

**[COUPLING]** Upload component needs access to credit balance to:
- Disable upload button when balance = 0
- Show warning when balance < 10
- Update displayed balance after successful uploads

**Options:**
- A) Pass balance as prop from parent (dashboard/event detail)
- B) Use React Query shared cache (both components read `/dashboard`)
- C) Context API for credit balance (overkill for MVP)

**Recommendation:** Option B (shared React Query cache) - automatic sync.

```typescript
// In upload component
const { data } = useQuery({ 
  queryKey: ['dashboard'],
  // Stale time keeps cache fresh
  staleTime: 30000, // 30 seconds
});

const credits = data?.data?.credits?.balance ?? 0;
```

### 3. Photo Gallery and Upload Optimistic Updates

**Context:** T-18 (Gallery API) returns paginated photos. After upload succeeds, new photo should appear in gallery immediately.

**[COUPLING]** Upload success must invalidate gallery cache or optimistically add photo.

**Approaches:**

| Approach | Pros | Cons |
|----------|------|------|
| Invalidate cache | Guaranteed consistency | Refetches all pages, slow |
| Optimistic add to first page | Instant feedback | Pagination breaks if not handled |
| WebSocket update | Real-time for all tabs | Complex, overkill |

**Recommendation:** Optimistic add to cache with queryClient mutation:

```typescript
const queryClient = useQueryClient();

const handleUploadSuccess = (photoId: string, r2Key: string) => {
  // Add to cache
  queryClient.setQueryData(['photos', eventId], (old: InfiniteData) => {
    const newPhoto = {
      id: photoId,
      r2Key,
      thumbnailUrl: generateThumbnailUrl(r2Key),
      status: 'processing',
      faceCount: 0,
      uploadedAt: new Date().toISOString(),
    };
    
    return {
      ...old,
      pages: old.pages.map((page, i) => 
        i === 0 
          ? { ...page, data: [newPhoto, ...page.data] }
          : page
      ),
    };
  });
  
  // Invalidate to refresh with server data (including status updates)
  queryClient.invalidateQueries(['photos', eventId]);
};
```

### 4. Upload Error Messages and Retry Logic

**Context:** API returns different error codes per T-16 risk scout.

**Error code mapping:**

| API Error Code | HTTP Status | Meaning | User Message | Allow Retry? |
|----------------|-------------|---------|--------------|--------------|
| `FILE_TOO_LARGE` | 413 | File > 20 MB | "File exceeds 20 MB limit" | No |
| `UNSUPPORTED_FORMAT` | 415 | RAW or other format | "Unsupported file format. Use JPEG, PNG, HEIC, or WebP" | No |
| `INSUFFICIENT_CREDITS` | 402 | Balance < 1 | "Insufficient credits. Purchase more to continue." | No |
| `EVENT_EXPIRED` | 410 | Event past expiry | "This event has expired. No new uploads allowed." | No |
| `R2_UPLOAD_FAILED` | 500 | R2 service issue | "Storage service unavailable. Credit was charged. Contact support." | No (credit deducted) |
| `QUEUE_FAILED` | 500 | Queue service issue | "Processing queue unavailable. Credit was charged. Contact support." | No (credit deducted) |
| `NETWORK_ERROR` | - | Timeout/connection | "Network error. Check connection and retry." | Yes (credit not deducted) |

**[COUPLING]** Upload component must handle all error codes and map to UI.

```typescript
function getErrorMessage(error: ApiError): { message: string; retryable: boolean; creditDeducted: boolean } {
  switch (error.code) {
    case 'FILE_TOO_LARGE':
      return { message: 'File exceeds 20 MB limit', retryable: false, creditDeducted: false };
    case 'INSUFFICIENT_CREDITS':
      return { message: 'Insufficient credits', retryable: false, creditDeducted: false };
    case 'R2_UPLOAD_FAILED':
    case 'QUEUE_FAILED':
      return { 
        message: 'Upload failed. Credit was charged. Contact support.', 
        retryable: false, 
        creditDeducted: true 
      };
    case 'NETWORK_ERROR':
      return { message: 'Network error. Please retry.', retryable: true, creditDeducted: false };
    default:
      return { message: 'Unknown error', retryable: false, creditDeducted: false };
  }
}
```

---

## HI gates (requires explicit approval)

### [HI_GATE] 1. Drag-and-Drop Implementation

**Decision needed:** Implement drag-and-drop for desktop, or file picker only?

**Impact:**
- Desktop UX: Drag-and-drop is expected modern pattern
- Mobile: File picker is only reliable option
- Complexity: Drag-and-drop requires feature detection, event handling, visual feedback

**Options:**
- A) File picker only (simplest, works everywhere)
- B) Drag-and-drop with file picker fallback (best UX)
- C) Drag-and-drop only on desktop (requires device detection)

**Recommendation:** Option B (feature detection + fallback)

---

### [HI_GATE] 2. Credit Deduction Error Handling

**Decision needed:** How to handle uploads that fail after credit deduction?

**Context:** API deducts credit before R2 upload (per plan). If R2 fails, credit is lost.

**Options:**
- A) Show error, disable retry, provide support reference (as planned)
- B) Allow retry, warning user it will charge another credit
- C) Queue for manual refund, notify user via email

**Recommendation:** Option A (as planned) + add support contact flow.

**Required UI:**
```
⚠️ Upload Failed
Credit was charged for this upload. 
Reference: photo-abc123

[Copy Reference] [Contact Support]

Do not retry - this will charge another credit.
```

---

### [HI_GATE] 3. Concurrent Upload Limit

**Decision needed:** Maximum number of parallel uploads?

**Trade-offs:**

| Limit | Pros | Cons |
|-------|------|------|
| 1 (sequential) | Simple state, predictable | Very slow (50 photos = 20+ minutes) |
| 3-5 (moderate) | Good balance | Still slow for large batches |
| 10+ (aggressive) | Fast uploads | Server load, network congestion, complex state |
| Unlimited | Fastest | Browser connection limits (6-8), UI chaos |

**Recommendation:** 5 concurrent uploads - balances speed and server load.

**Implementation:**
```typescript
const MAX_CONCURRENT = 5;
const [uploading, setUploading] = useState<Set<string>>(new Set());

const uploadNext = async () => {
  if (uploading.size >= MAX_CONCURRENT) return;
  
  const next = queue.find(item => item.status.state === 'pending');
  if (!next) return;
  
  setUploading(prev => new Set(prev).add(next.id));
  try {
    await uploadFile(next.file);
  } finally {
    setUploading(prev => {
      const updated = new Set(prev);
      updated.delete(next.id);
      return updated;
    });
    uploadNext(); // Start next in queue
  }
};
```

---

### [HI_GATE] 4. Gallery Infinite Scroll vs Load More

**Decision needed:** How to load additional pages of photos?

**Options:**
- A) "Load More" button at bottom (explicit, predictable)
- B) Infinite scroll with intersection observer (automatic, modern)
- C) Pagination with page numbers (traditional, less suited for images)

**Recommendation:** Option B (infinite scroll) - better UX for image galleries.

---

### [HI_GATE] 5. Thumbnail Fit Mode

**Decision needed:** Should gallery thumbnails crop images (`fit=cover`) or show full image (`fit=contain`)?

**Visual comparison:**
- `fit=cover`: Uniform grid, some content cropped
- `fit=contain`: Full image visible, uneven heights

**Recommendation:** `fit=cover` for grid (uniform), `fit=contain` for lightbox.

---

## Performance / scale concerns

### 1. Memory Pressure from Large File Lists

**Scenario:** Photographer selects 100 photos (2 GB total) for upload.

**Browser limits:**
- Desktop: ~2-4 GB JavaScript heap
- Mobile: ~500 MB - 1 GB heap

**[PERF]** Holding 100 File objects in memory risks OOM crashes.

**Mitigation:**
- Don't read files into memory (use FormData with File reference)
- Stream uploads one at a time (or batches of 5)
- Release file references after upload completes

```typescript
// GOOD: Keep reference only
const formData = new FormData();
formData.append('file', file); // Passes reference, not data

// BAD: Read entire file
const arrayBuffer = await file.arrayBuffer(); // 20 MB in memory
```

### 2. Gallery Rendering Performance

**Scenario:** Event has 500 photos. Rendering 500 `<img>` tags causes layout thrashing.

**[PERF]** Solution: Lazy loading + virtual scrolling.

**Lazy loading (native browser support):**
```tsx
<img src={url} loading="lazy" />
```

**Virtual scrolling (if needed):**
- Library: `react-window` or `react-virtualized`
- Renders only visible images (e.g., 20 at a time)
- Dynamically adds/removes DOM nodes on scroll

**Recommendation for MVP:** Native lazy loading first. Add virtual scrolling only if performance issues observed.

### 3. CF Images CDN Cache Warming

**Scenario:** First photographer to view gallery requests 50 thumbnails. CF Images transforms all 50 (cache miss). Takes 30+ seconds.

**[PERF]** Subsequent views are fast (cache hit).

**Mitigation:**
- Accept slow first load (rare per CF Images caching)
- Consider warming cache after upload (background job hits thumbnail URLs)

**[GAP]** No cache warming mechanism. Accept for MVP.

### 4. Network Bandwidth for Concurrent Uploads

**Scenario:** Photographer on slow connection (1 Mbps upload, typical Thai ADSL) uploads 5 photos concurrently.

**Math:**
- 1 Mbps = 125 KB/s
- 5 concurrent 5 MB uploads = 25 MB total
- Time: 25 MB / 125 KB/s = 200 seconds = 3.3 minutes

**[PERF]** Concurrent uploads on slow connections share bandwidth, no net speedup.

**Mitigation:**
- Reduce concurrency on detected slow connections
- Detect via `navigator.connection.effectiveType` (Chrome/Edge only)

```typescript
const connection = (navigator as any).connection;
const isSlow = connection?.effectiveType === '2g' || connection?.effectiveType === '3g';
const maxConcurrent = isSlow ? 2 : 5;
```

---

## Security considerations

### 1. Client-Side File Type Validation (Bypassable)

**Risk:** Malicious user bypasses client validation, uploads non-image files or malicious images.

**[SECURITY]** Client validation is UX only. Server MUST re-validate.

**Evidence from T-16:** Server validates format via magic bytes, not client-provided MIME type.

**Conclusion:** Client validation can be minimal (extension + size). Server is enforcement layer.

### 2. Credit Balance Display Tampering

**Risk:** User modifies client-side credit balance display to bypass upload limits.

**[SECURITY]** Server enforces credit check. Client display is informational only.

**Mitigation:**
- Never trust client-reported balance
- Server deducts credit and validates balance on every upload
- Client balance display can desync, but doesn't affect security

### 3. CORS and Image Loading

**Risk:** CF Images URLs must be accessible from dashboard origin.

**Current setup:**
- Dashboard: `https://dashboard.sabaipics.com`
- CF Images: `https://sabaipics.com/cdn-cgi/image/...`
- R2: `https://photos.sabaipics.com`

**[SECURITY]** CORS headers required if dashboard and images are different origins.

**Required headers (configured on R2 bucket and CF Images):**
```
Access-Control-Allow-Origin: https://dashboard.sabaipics.com
```

**[NEED_VALIDATION]** Verify CORS configured for R2 public bucket and CF Images zone.

### 4. Accidental Exposure of Photo URLs

**Risk:** Gallery component exposes R2 URLs in DOM/network panel. Unauthorized users could access photos.

**[SECURITY]** Photos are not secret (photographers share via QR codes). Public R2 access is acceptable.

**Evidence from plan:** Gallery is photographer-only view. Guest search (S-2) is separate feature.

**Conclusion:** No additional security needed for gallery URLs.

---

## Gaps

### [GAP] 1. No Upload Component Library in Use

**Issue:** No existing file upload patterns in codebase. No libraries like `react-dropzone` in dependencies.

**Resolution options:**
- A) Install `react-dropzone` (11 KB, battle-tested)
- B) Build custom dropzone (full control, more code)

**Recommendation:** Option A (react-dropzone) for MVP.

```bash
pnpm add react-dropzone
```

**Usage:**
```tsx
import { useDropzone } from 'react-dropzone';

const { getRootProps, getInputProps, isDragActive } = useDropzone({
  accept: {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/heic': ['.heic', '.heif'],
    'image/webp': ['.webp'],
  },
  maxSize: 20 * 1024 * 1024,
  onDrop: handleFiles,
});
```

### [GAP] 2. No Lightbox Library for Image Preview

**Issue:** Gallery should support clicking thumbnail to view full-size image.

**Standard libraries:**
- `yet-another-react-lightbox` (modern, TypeScript, 15 KB)
- `react-image-lightbox` (older, still maintained)

**Recommendation:** `yet-another-react-lightbox`

```bash
pnpm add yet-another-react-lightbox
```

### [GAP] 3. No Progress Indicator Component

**Issue:** Upload progress requires progress bar component.

**Current UI library:** shadcn/ui components in `packages/ui`

**Resolution:** Add `progress` component via shadcn CLI:

```bash
pnpm --filter=@sabaipics/ui ui:add progress
```

### [GAP] 4. No Toast/Notification System

**Issue:** Upload success/error feedback needs toast notifications.

**Current state:** T-15 identified same gap.

**Resolution:** Add `sonner` (lightweight toast library):

```bash
pnpm add sonner
```

**Usage:**
```tsx
import { toast } from 'sonner';

toast.success('Photo uploaded successfully');
toast.error('Upload failed: insufficient credits');
```

### [GAP] 5. No Loading Skeleton for Gallery

**Issue:** Gallery loading state should show skeleton instead of blank space.

**Current UI:** Skeleton component exists in `packages/ui` (used in dashboard)

**Resolution:** Reuse existing `Skeleton` component:

```tsx
import { Skeleton } from "@sabaipics/ui/components/skeleton";

{isLoading && (
  <div className="grid grid-cols-4 gap-4">
    {Array.from({ length: 12 }).map((_, i) => (
      <Skeleton key={i} className="aspect-square" />
    ))}
  </div>
)}
```

---

## Decisions Affecting T-19

From execution plan and upstream tasks:

| Decision # | Decision | Impact on T-19 |
|------------|----------|----------------|
| 2 | Image format handling: Normalize to JPEG (4000px max width) | Gallery displays normalized JPEGs, not originals |
| 5 | Thumbnails: CF Images on-demand (400px / 1200px) | Gallery uses CF Images transform URLs |
| 13 | Credit deduction: After validation, no refund | Upload errors must clearly indicate if credit was charged |
| 16 | Accepted formats: JPEG, PNG, HEIC, WebP (no RAW) | Client validation must reject RAW files |
| 17 | Max upload size: 20 MB | Client validation must check file size |

---

## Testing strategy

### Unit Tests (Component-Level)

**Upload component:**
- [ ] File validation (size, format)
- [ ] Concurrent upload queue management
- [ ] Progress tracking state updates
- [ ] Error handling and retry logic
- [ ] Credit balance updates after upload

**Gallery component:**
- [ ] Infinite scroll pagination
- [ ] Image lazy loading
- [ ] Lightbox open/close
- [ ] Empty state (no photos)

### Integration Tests (API Mock)

- [ ] Upload success flow (mock POST /events/:id/photos)
- [ ] Upload failure: insufficient credits (mock 402 response)
- [ ] Upload failure: invalid format (mock 415 response)
- [ ] Upload failure: R2 error (mock 500 with creditDeducted=true)
- [ ] Gallery load with pagination (mock GET /events/:id/photos)

### Manual Testing (Device Matrix)

**Upload testing:**
- [ ] Desktop Chrome: drag-and-drop + file picker
- [ ] Desktop Safari: file picker
- [ ] iPhone Safari: file picker (camera roll)
- [ ] Android Chrome: file picker
- [ ] LINE in-app browser (iOS): file picker
- [ ] LINE in-app browser (Android): file picker

**Gallery testing:**
- [ ] Desktop: scroll 500 photos, check performance
- [ ] Mobile: scroll 100 photos, check memory
- [ ] Slow 3G: throttle network, test image loading
- [ ] Lightbox: click thumbnail, view full image

**Edge cases:**
- [ ] Upload 0 photos (empty selection)
- [ ] Upload 1 photo
- [ ] Upload 100 photos simultaneously
- [ ] Upload with 0 credits (button disabled)
- [ ] Upload HEIC from iPhone
- [ ] Upload 20 MB file (at limit)
- [ ] Upload 20.1 MB file (rejected)
- [ ] Network timeout mid-upload
- [ ] Navigate away during upload

---

## Implementation checklist

### Pre-implementation
- [ ] Verify T-16 (Upload API) is complete and merged
- [ ] Verify T-18 (Gallery API) is complete and merged
- [ ] Verify T-15 (Events UI) is complete (event detail page exists)
- [ ] Install `react-dropzone`, `yet-another-react-lightbox`, `sonner`
- [ ] Add shadcn `progress` component

### Upload Component
- [ ] Create `UploadDropzone` component
- [ ] File selection (drag-and-drop + file picker)
- [ ] Client-side validation (size, format)
- [ ] Upload queue management (max 5 concurrent)
- [ ] Progress tracking per file
- [ ] Success handling (update credit balance, add to gallery cache)
- [ ] Error handling (map API errors to user messages)
- [ ] Cancel button per upload
- [ ] Overall progress summary (X of Y uploaded)
- [ ] Credit balance display and warning (< 10 credits)

### Gallery Component
- [ ] Create `PhotoGallery` component
- [ ] Fetch photos from GET /events/:id/photos
- [ ] Infinite scroll with intersection observer
- [ ] Grid layout (responsive: 2 cols mobile, 4 cols desktop)
- [ ] Thumbnail display with CF Images URLs
- [ ] Lazy loading (native browser support)
- [ ] Loading state (skeleton grid)
- [ ] Empty state (no photos uploaded yet)
- [ ] Lightbox integration (click thumbnail → full preview)
- [ ] Photo status badges (processing, indexed, failed)
- [ ] Face count display per photo

### Event Detail Page Integration
- [ ] Enable "Photos" tab (remove `disabled` prop)
- [ ] Add `PhotosTab` component to tab content
- [ ] Compose `UploadDropzone` + `PhotoGallery` in tab
- [ ] Maintain tab switching UX (existing pattern)

### Error Handling
- [ ] Toast notifications for success/error
- [ ] Error message mapping (API error codes → user messages)
- [ ] Credit deduction flag in error UI
- [ ] Retry button (only for retryable errors)
- [ ] Support reference display (for post-deduction failures)

### Testing
- [ ] Unit tests (validation, queue, state)
- [ ] Integration tests (API mocks)
- [ ] Manual testing on target devices (iOS Safari, LINE, Android)
- [ ] Performance testing (500 photos, slow 3G)

---

## Rollout / ops

### Environment Variables
- `VITE_API_URL` - Already configured (dashboard → API)

### Monitoring
- Track upload success/failure rate (client-side analytics)
- Track gallery load time (client-side performance)
- Monitor toast error rates (which errors most common)

### Feature Flags
- Consider feature flag for drag-and-drop (disable if mobile issues)
- Consider feature flag for concurrent upload limit (adjust if server load issues)

---

## Follow-ups

### [ENG_DEBT]
- Add virtual scrolling if >500 photos causes performance issues
- Add cache warming for CF Images thumbnails (background job)
- Add upload retry queue for network failures
- Extract upload logic to custom hook (reusable for FTP feature later)

### [PM_FOLLOWUP]
- Confirm concurrent upload limit (5 is technical recommendation)
- Confirm credit deduction error handling UX
- Provide copy for empty states and error messages

### [DESIGN_FOLLOWUP]
- Gallery grid layout (spacing, hover effects, selection UI for future batch download)
- Upload dropzone visual design (drag overlay, file icons)
- Progress bar design (per-file vs overall)
- Lightbox design (navigation, zoom, download button)

---

## Risk assessment summary

| Risk Category | Level | Mitigation |
|---------------|-------|------------|
| Mobile browser compatibility | HIGH | Feature detection + fallback to file picker |
| Concurrent upload state | HIGH | Careful state management + error boundaries |
| Credit deduction UX | MEDIUM | Clear messaging on post-deduction failures |
| Performance (large galleries) | MEDIUM | Lazy loading + infinite scroll |
| API integration | LOW | T-16 and T-18 complete, contracts clear |
| Security | LOW | Server enforces all validation |

---

## Recommendation

**Proceed with implementation.** T-16 (Upload API) and T-18 (Gallery API) are prerequisites and must be complete. Risks are manageable with proper mobile browser testing and state management patterns. No blocking HI gates beyond standard design decisions.

**Critical path:**
1. Install dependencies (react-dropzone, lightbox, sonner)
2. Create UploadDropzone component (validation + queue + progress)
3. Create PhotoGallery component (infinite scroll + lazy load)
4. Integrate into event detail page Photos tab
5. Test on mobile devices (iOS Safari, LINE, Android)
6. Test performance with 500 photos

**Estimated effort:** 3-5 days (including mobile testing)

---

## Provenance

**Files examined:**
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/plan/final.md`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/implementation/T-16/context/upstream-dossier.md`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/implementation/T-16/context/risk-scout.md`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/implementation/T-18/context/upstream-dossier.md`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/implementation/T-15/context/risk-scout.md`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/dashboard/src/routes/events/[id]/index.tsx`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/dashboard/package.json`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/research/cf-upload-limits.md`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/research/heic-rekognition.md`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/context/surface-map.md`

**Commands run:**
- Grep for existing file upload patterns (none found)
- Read dashboard package.json (no upload libraries)
- Read event detail page (tabs UI structure)
- Read T-16/T-18 risk scouts (API contracts)
- Read execution plan (credit deduction flow)
