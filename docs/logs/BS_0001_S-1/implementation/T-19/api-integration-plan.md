# T-19 API Integration Plan

Date: 2026-01-12
Task: Remove mock data and integrate with real backend APIs

## Overview

Currently the photo UI uses mock data (`USE_MOCK_DATA = true`). This plan outlines the API calls needed and how to switch to real backend integration.

## API Endpoints Used

### 1. GET /events/:eventId/photos (Gallery/List)

**Purpose:** Fetch paginated list of photos for an event

**Hook:** `usePhotos` in `apps/dashboard/src/hooks/photos/usePhotos.ts`

**Request:**
```
GET /events/:eventId/photos?cursor=<timestamp>&limit=<number>
Headers:
  Authorization: Bearer <token>
```

**Query Parameters:**
- `cursor` (optional): ISO timestamp for pagination (e.g., "2026-01-11T12:00:00Z")
- `limit` (optional): Number of photos per page, default 20, max 50

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "thumbnailUrl": "https://.../cdn-cgi/image/width=400.../photo.jpg",
      "previewUrl": "https://.../cdn-cgi/image/width=1200.../photo.jpg",
      "downloadUrl": "https://...presigned-r2-url",
      "faceCount": 3,
      "status": "indexed",
      "uploadedAt": "2026-01-11T10:30:00Z"
    }
  ],
  "pagination": {
    "nextCursor": "2026-01-11T10:00:00Z",
    "hasMore": true
  }
}
```

**Error Responses:**
- 401: Unauthorized (no/invalid token)
- 403: Forbidden (not event owner)
- 404: Event not found

**Used By:**
- Photos tab (Grid View)
- Photos tab (List View)
- React Query infinite query for pagination

**Current Implementation:**
- Real API code exists in `else` block
- Mock data used when `USE_MOCK_DATA = true`
- Uses React Query's `useInfiniteQuery` for pagination

---

### 2. POST /events/:eventId/photos (Upload)

**Purpose:** Upload a single photo to an event

**Hook:** `useUploadPhoto` in `apps/dashboard/src/hooks/photos/useUploadPhoto.ts`

**Request:**
```
POST /events/:eventId/photos
Headers:
  Authorization: Bearer <token>
  Content-Type: multipart/form-data
Body:
  file: <File>
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "thumbnailUrl": "https://...",
    "previewUrl": "https://...",
    "downloadUrl": "https://...",
    "faceCount": null,
    "status": "processing",
    "uploadedAt": "2026-01-11T10:30:00Z"
  }
}
```

**Error Responses:**
- 400: Validation error (invalid format, too large, missing file)
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "File too large. Maximum size is 20MB."
    }
  }
  ```
- 402: Insufficient credits
  ```json
  {
    "error": {
      "code": "INSUFFICIENT_CREDITS",
      "message": "Insufficient credits. Purchase more to continue."
    }
  }
  ```
- 403: Event expired
  ```json
  {
    "error": {
      "code": "EVENT_EXPIRED",
      "message": "This event has expired and cannot accept new photos."
    }
  }
  ```
- 404: Event not found
- 413: Payload too large

**Used By:**
- Upload dropzone (file selection/drag-drop)
- Uploading tab (table with progress)
- Upload queue management in event detail page

**Current Implementation:**
- Real API code exists in `else` block
- Mock upload simulation when `USE_MOCK_DATA = true`
- Returns full photo object (extended in mock to match real API)

---

## Mock Data Locations

### Files with Mock Data Flags

1. **`apps/dashboard/src/hooks/photos/usePhotos.ts`**
   - Line ~4: `const USE_MOCK_DATA = true;`
   - Lines 28-76: Mock data cache and generation
   - Lines 88-108: Mock query function

2. **`apps/dashboard/src/hooks/photos/useUploadPhoto.ts`**
   - Line ~4: `const USE_MOCK_DATA = true;`
   - Lines 26-34: Mock upload simulation
   - Lines 42-90: Mock success/error logic

3. **`apps/dashboard/src/routes/events/[id]/index.tsx`**
   - Lines 296-343: Mock upload queue injection (useEffect)
   - Only runs in development mode (`import.meta.env.DEV`)

---

## Integration Steps

### Step 1: Switch usePhotos to Real API

**File:** `apps/dashboard/src/hooks/photos/usePhotos.ts`

**Change:**
```typescript
// Line 4: Change this
const USE_MOCK_DATA = true;

// To this
const USE_MOCK_DATA = false;
```

**What happens:**
- Uses real `fetch()` call to API
- Gets real photos from database
- Pagination uses real cursor values
- No more stable cache needed

**Expected behavior:**
- Empty gallery if no photos uploaded yet
- Real photos appear after upload
- Real face counts from Rekognition (T-17)
- Real processing → indexed status transitions

---

### Step 2: Switch useUploadPhoto to Real API

**File:** `apps/dashboard/src/hooks/photos/useUploadPhoto.ts`

**Change:**
```typescript
// Line 4: Change this
const USE_MOCK_DATA = true;

// To this
const USE_MOCK_DATA = false;
```

**What happens:**
- Uses real `fetch()` call to upload endpoint
- Real FormData upload with progress
- Real error handling (402, 403, 400)
- Real credit deduction
- Real photo processing

**Expected behavior:**
- Upload shows in "Uploading" tab
- Credit deducted from account
- Photo appears with "processing" status
- After T-17 processes: status → "indexed", face count populated

---

### Step 3: Remove Mock Upload Queue Injection

**File:** `apps/dashboard/src/routes/events/[id]/index.tsx`

**Change:**
```typescript
// Lines 296-343: Remove or comment out this entire useEffect
useEffect(() => {
  // Inject mock upload queue on mount (only in development)
  if (import.meta.env.DEV && uploadQueue.length === 0) {
    const mockQueue: UploadQueueItem[] = [
      // ... mock data
    ];
    setUploadQueue(mockQueue);
  }
}, []);
```

**What happens:**
- No fake uploads in Uploading/Failed tabs
- Tabs start empty
- Only real uploads appear

**Expected behavior:**
- "Uploading" tab shows empty state initially
- "Failed" tab shows empty state initially
- Real uploads appear when user selects files

---

### Step 4: Remove Mock Data Cache (Optional Cleanup)

**File:** `apps/dashboard/src/hooks/photos/usePhotos.ts`

**Optional:** Remove the mock data cache entirely (lines 28-76) since it won't be used.

**Keep or Remove?**
- **Keep:** Useful for quick testing without backend
- **Remove:** Cleaner code, no unused constants

**Recommendation:** Keep it but commented out for easy re-enabling during development.

---

## Testing After Integration

### Prerequisites
1. Backend API running and accessible at `VITE_API_URL`
2. Clerk authentication working
3. Event exists in database with valid eventId
4. User has photographer permissions
5. User has credits available

### Test Cases

#### 1. Empty Gallery
- Navigate to event with no photos
- Verify Photos tab shows empty state: "No photos uploaded yet"
- Verify Uploading tab shows empty state
- Verify Failed tab shows empty state

#### 2. Upload Flow
- Select/drag 3 photos
- Verify files appear in Uploading tab with progress bars
- Verify credit balance decreases by 3
- Wait for uploads to complete
- Verify photos move from Uploading → Photos tab
- Verify status badges show "Processing"

#### 3. Face Detection (requires T-17)
- Wait ~10 seconds after upload
- Verify status changes from "Processing" → "Indexed"
- Verify face count badges appear with numbers

#### 4. Pagination
- Upload 60+ photos (to exceed page limit)
- Scroll to bottom of Photos tab
- Click "Load More"
- Verify next page of photos loads
- Verify no duplicates

#### 5. Error Handling
- Upload with 0 credits → verify 402 error in Failed tab, no retry button
- Upload invalid file (PDF) → verify 400 error in Failed tab, retry button shows
- Upload 30MB file → verify 413/400 error

#### 6. Bulk Download
- Select multiple photos in grid view
- Click "Download Selected"
- Verify all photos download sequentially

#### 7. Lightbox
- Click photo thumbnail
- Verify lightbox opens with full-size image
- Use arrow keys to navigate
- Press ESC to close

---

## Rollback Plan

If real API integration has issues:

1. **Quick rollback to mock data:**
   ```typescript
   // In both hooks:
   const USE_MOCK_DATA = true;
   ```

2. **Partial rollback:**
   - Keep usePhotos on real API (gallery works)
   - Switch useUploadPhoto back to mock (upload debugging)

3. **Re-enable mock queue:**
   - Uncomment useEffect in index.tsx
   - Useful for testing Uploading/Failed tab UI

---

## Environment Variables Required

### Dashboard (.env)
```bash
VITE_API_URL=http://localhost:8787  # or production URL
VITE_CLERK_PUBLISHABLE_KEY=pk_...
```

### API (wrangler.toml or .dev.vars)
```bash
DATABASE_URL=...
CLOUDFLARE_ACCOUNT_ID=...
R2_BUCKET=...
REKOGNITION_QUEUE_NAME=...
```

---

## Known Limitations (from T-16, T-18)

### From Upload API (T-16)
1. No upload progress percentage (API limitation)
   - Frontend shows indeterminate progress
   - Completed = success response received
2. No upload cancellation
   - Once credit deducted, upload must complete
3. No idempotency keys
   - Avoid duplicate submissions
4. No rate limiting
   - Frontend limits to 5 concurrent uploads

### From Gallery API (T-18)
1. Download URLs expire in 15 minutes
   - May need to re-fetch if user delays download
2. Status polling required
   - UI should poll or use websockets for status updates (future)
3. No search/filter
   - Gallery shows all photos, pagination only

---

## Success Criteria

✅ Photos tab loads real photos from database
✅ Upload dropzone uploads to real API
✅ Credits deducted correctly
✅ Status transitions work (processing → indexed)
✅ Face counts populate after Rekognition (T-17)
✅ Error handling works (402, 403, 400)
✅ Pagination works with real cursors
✅ Bulk download works
✅ Lightbox displays real images
✅ No console errors
✅ Type check passes
✅ Build succeeds

---

## Post-Integration Tasks

After successful integration:

1. **Update documentation** - Mark mock data sections as deprecated
2. **Remove commented mock code** - Clean up if keeping mock data disabled
3. **Add error monitoring** - Log API errors to monitoring service
4. **Performance testing** - Test with 500+ photos
5. **Mobile testing** - Verify upload/download on mobile
6. **Cross-browser testing** - Safari, Chrome, Firefox

---

## Summary

**Current State:** Mock data active (`USE_MOCK_DATA = true`)
**Target State:** Real API integration (`USE_MOCK_DATA = false`)
**Files to Change:** 3 files (2 hooks + 1 route)
**Lines to Change:** ~3 lines (flip flags + remove useEffect)
**Risk Level:** Low (real API code already exists and tested)
**Rollback:** Easy (flip flags back to `true`)
**Testing Time:** 30-60 minutes manual testing
