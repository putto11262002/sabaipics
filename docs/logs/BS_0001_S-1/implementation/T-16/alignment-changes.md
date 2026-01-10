# T-16 Implementation Alignment Changes

**Date**: 2026-01-11
**Status**: Changes required to align with final plan
**Current Implementation**: PR #24 (branch: task/T-16-photo-upload-api)

---

## Summary of Misalignment

The current implementation diverges from the final plan in **normalization timing and approach**:

### Plan Specification (final.md lines 304-305)
```
Step 6: Deduct 1 credit
Step 7: Normalize: convert to JPEG, max 4000px, quality 90%
Step 8: Stream normalized JPEG to R2
```

**Plan expects:** Normalize in-memory BEFORE R2 upload (single write)

### Current Implementation (index.ts lines 470-551)
```
Step 1: Deduct credit
Step 2: Upload original to R2
Step 3: Fetch via CF Images Transform (external API)
Step 4: Store normalized JPEG to R2
Step 5: Delete original
```

**Implementation does:** Upload → transform → replace (double write)

---

## Required Changes

### Change 1: Normalize In-Memory Before Upload

**Current code (index.ts lines 470-551):**
```typescript
// 3. Upload original file to R2
const fileExtension = file.type.split("/")[1] || "jpg";
const r2Key = `${eventId}/${photo.id}.${fileExtension}`;
await c.env.PHOTOS_BUCKET.put(r2Key, arrayBuffer, {
  httpMetadata: { contentType: file.type },
});

// 4. Normalize to JPEG via Cloudflare Images Transform
const r2PublicUrl = `${c.env.PHOTO_R2_BASE_URL}/${r2Key}`;
const transformResponse = await fetch(r2PublicUrl, {
  cf: { image: { format: "jpeg", quality: 90, ... } },
});
normalizedImageBytes = await transformResponse.arrayBuffer();

// 5. Overwrite R2 object with normalized JPEG
await c.env.PHOTOS_BUCKET.put(normalizedR2Key, normalizedImageBytes, ...);
if (r2Key !== normalizedR2Key) {
  await c.env.PHOTOS_BUCKET.delete(r2Key);
}
```

**Should be changed to:**
```typescript
// 3. Normalize in-memory (before any R2 upload)
const normalizedImageBytes = await normalizeImage(arrayBuffer, file.type, {
  format: "jpeg",
  maxWidth: 4000,
  maxHeight: 4000,
  quality: 90,
  fit: "scale-down",
});

// 4. Upload normalized JPEG to R2 (single operation)
const r2Key = `${eventId}/${photo.id}.jpg`;
await c.env.PHOTOS_BUCKET.put(r2Key, normalizedImageBytes, {
  httpMetadata: { contentType: "image/jpeg" },
});

// No deletion needed - only one file uploaded
```

**Impact:**
- ✅ Aligns with plan specification
- ✅ Reduces R2 operations: 2-3 writes → 1 write
- ✅ Reduces failure points: 4 → 2 post-deduction failures
- ✅ Removes external CF Images Transform dependency during upload
- ⚠️ Requires image processing capability in Worker

---

### Change 2: Implement `normalizeImage()` Function

**New file needed:** `apps/api/src/lib/images/normalize.ts`

**Implementation approach (2 options):**

#### Option A: Use Cloudflare Images Upload API (Recommended)
```typescript
export async function normalizeImage(
  imageBytes: ArrayBuffer,
  mimeType: string,
  options: {
    format: "jpeg";
    maxWidth: number;
    maxHeight: number;
    quality: number;
    fit: string;
  }
): Promise<ArrayBuffer> {
  // Upload to CF Images (not R2) for processing
  const formData = new FormData();
  formData.append("file", new Blob([imageBytes], { type: mimeType }));

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_IMAGES_API_TOKEN}` },
      body: formData,
    }
  );

  const result = await response.json();
  const imageUrl = result.result.variants[0]; // Get normalized variant

  // Download normalized image
  const normalized = await fetch(imageUrl);
  return normalized.arrayBuffer();
}
```

**Pros:**
- Uses Cloudflare infrastructure (fast, reliable)
- No bundle size increase
- Handles HEIC/WebP automatically

**Cons:**
- Requires CF Images API token
- Additional API call (but in-memory, no R2 involved)
- Cost: CF Images pricing applies

#### Option B: Use WASM Image Processing
```typescript
import { heicToJpeg } from "libheif-js"; // or similar WASM library

export async function normalizeImage(...): Promise<ArrayBuffer> {
  // Detect format from magic bytes
  const format = detectFormat(imageBytes);

  let imageData: ArrayBuffer;

  // Convert HEIC/WebP to intermediate format if needed
  if (format === "heic" || format === "heif") {
    imageData = await heicToJpeg(imageBytes);
  } else {
    imageData = imageBytes;
  }

  // Resize and compress (using sharp-wasm or similar)
  const normalized = await resizeAndCompress(imageData, {
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    quality: options.quality,
  });

  return normalized;
}
```

**Pros:**
- Self-contained (no external API)
- Predictable performance

**Cons:**
- Bundle size increase (~500KB gzipped)
- CPU usage in Worker
- Complexity (WASM initialization, error handling)

**Recommendation:** **Option A (CF Images Upload API)** for MVP, consider Option B if costs become prohibitive.

---

### Change 3: Update Photo Record Creation Timing

**Current code (index.ts lines 446-454):**
```typescript
// Create photo record with status='processing'
const [newPhoto] = await tx
  .insert(photos)
  .values({
    eventId,
    r2Key: "", // Will be updated after upload
    status: "processing",
    faceCount: 0,
  })
  .returning();
```

**Should be changed to:**
```typescript
// Create photo record AFTER normalization, before R2 upload
const r2Key = `${eventId}/${photoId}.jpg`; // Known upfront

const [newPhoto] = await tx
  .insert(photos)
  .values({
    eventId,
    r2Key, // Set immediately (not updated later)
    status: "processing",
    faceCount: 0,
  })
  .returning();
```

**Impact:**
- No longer need to update photo record after R2 upload
- Cleaner flow: transaction → normalize → upload once → enqueue

---

### Change 4: Remove Original File Deletion Logic

**Code to remove (index.ts lines 531-533):**
```typescript
// Delete original if different extension
if (r2Key !== normalizedR2Key) {
  await c.env.PHOTOS_BUCKET.delete(r2Key);
}
```

**Reason:** Only one file is uploaded (normalized JPEG), so no cleanup needed.

---

### Change 5: Update r2Key Record Update Logic

**Code to remove (index.ts lines 535-541):**
```typescript
// Update photo record with normalized key
await db
  .update(photos)
  .set({ r2Key: normalizedR2Key })
  .where(eq(photos.id, photo.id));

photo.r2Key = normalizedR2Key;
```

**Reason:** r2Key is set correctly during transaction, no update needed.

---

## Updated Flow (Aligned with Plan)

### Before (Current Implementation)
```
1. Validate file (format, size)
2. Check event (ownership, expiration)
3. Transaction:
   - Check credit balance
   - Deduct 1 credit (FIFO)
   - Create photo record (r2Key = "")
4. Upload original to R2
5. Fetch via CF Images Transform
6. Upload normalized to R2
7. Delete original
8. Update photo record (r2Key = normalized)
9. Enqueue job
10. Return 201
```

**Post-deduction failure points:** 4 (R2 upload, transform, R2 upload, queue)

### After (Aligned with Plan)
```
1. Validate file (format, size)
2. Check event (ownership, expiration)
3. Transaction:
   - Check credit balance
   - Deduct 1 credit (FIFO)
   - Create photo record (r2Key = "{eventId}/{photoId}.jpg")
4. Normalize in-memory (JPEG, 4000px, 90% quality)
5. Upload normalized JPEG to R2 (single operation)
6. Enqueue job
7. Return 201
```

**Post-deduction failure points:** 2 (R2 upload, queue) ✓ Matches plan

---

## File Changes Summary

### Files to Modify
1. **`apps/api/src/routes/events/index.ts`** (lines 470-551)
   - Replace 3-step upload/transform/replace with 2-step normalize/upload
   - Remove original file deletion
   - Remove photo record update

2. **`apps/api/src/routes/events/schema.ts`**
   - No changes needed (validation already correct)

### Files to Create
3. **`apps/api/src/lib/images/normalize.ts`** (NEW)
   - Implement `normalizeImage()` function
   - Handle HEIC/WebP/PNG/JPEG input
   - Output: normalized JPEG (4000px max, 90% quality)

### Files to Update (Documentation)
4. **`docs/logs/BS_0001_S-1/implementation/T-16/plan.md`**
   - Remove `[NEED_DECISION]` section (decision made: align with plan)
   - Update approach section to match final implementation

5. **`docs/logs/BS_0001_S-1/implementation/T-16/summary/iter-002.md`** (NEW)
   - Document alignment changes
   - Explain normalization approach chosen

---

## Testing Impact

### Tests to Update
**`apps/api/src/routes/events/index.test.ts`:**
- Mock `normalizeImage()` function instead of global `fetch`
- Remove CF Images Transform URL assertions
- Update R2 put call expectations (1 call instead of 2-3)

**New tests needed:**
- Unit test for `normalizeImage()` function
- Test HEIC → JPEG conversion
- Test large image resize (> 4000px)
- Test quality compression

---

## Deployment Considerations

### Option A: CF Images Upload API
**Environment variables needed:**
- `CF_IMAGES_API_TOKEN` - API token with Images write permission
- `CF_ACCOUNT_ID` - Cloudflare account ID

**Setup steps:**
1. Enable CF Images on Cloudflare account
2. Generate API token with `Images:Write` permission
3. Add token to wrangler.jsonc secrets

### Option B: WASM Processing
**Dependencies to add:**
```json
{
  "dependencies": {
    "libheif-js": "^1.x.x",  // For HEIC conversion
    "sharp-wasm": "^0.x.x"    // For resize/compress
  }
}
```

**Bundle size impact:** +500KB gzipped (still within 10MB Worker limit)

---

## Migration Strategy

### Immediate (Same PR)
**Option 1: Fix in current PR #24**
- Make alignment changes before merge
- Update tests
- Re-test manually
- Update PR description

### Phased (Separate PR)
**Option 2: Merge current, fix in follow-up**
- Mark current PR as "partial implementation"
- Create T-16.1 task for alignment
- Merge current (gets upload working, even if not optimal)
- Fix in next iteration

**Recommendation:** **Option 1** (fix in current PR) because:
- Changes are localized to one endpoint
- Avoids deploying non-compliant implementation
- Reduces technical debt
- Matches plan from the start

---

## Cost Analysis

### Current Implementation (2-Step Upload)
- R2 Class A operations (write): **2-3 per upload**
- R2 Class B operations (read): **0** (CF Images fetches it)
- CF Images Transform: **1 per upload**
- Cost per 1000 uploads: ~$0.54 (R2: $0.04, CF Images: $0.50)

### Aligned Implementation (1-Step Upload)
#### If using CF Images Upload API:
- R2 Class A operations (write): **1 per upload**
- CF Images Upload API: **1 per upload**
- Cost per 1000 uploads: ~$0.51 (R2: $0.01, CF Images: $0.50)
- **Savings:** ~5% (mainly R2 operations)

#### If using WASM:
- R2 Class A operations (write): **1 per upload**
- CF Images: **0**
- Worker CPU time: +2-5 seconds per upload
- Cost per 1000 uploads: ~$0.01 (R2 only)
- **Savings:** ~94% (no CF Images costs)

**Trade-off:** WASM has higher implementation complexity and worker CPU usage, but significant cost savings at scale.

---

## Recommendation

### For MVP / Quick Fix
**Use Option A: CF Images Upload API**
- Aligns with plan (in-memory normalization)
- Similar costs to current implementation
- Fast to implement (~2-4 hours)
- Proven, reliable Cloudflare infrastructure

### For Production / Scale
**Migrate to Option B: WASM Processing**
- Lower ongoing costs (no CF Images fees)
- Better performance (no network round-trip)
- More control over image quality
- Higher upfront implementation cost (~1-2 days)

**Suggested path:**
1. Fix current PR with Option A (CF Images Upload API)
2. Monitor costs and performance in staging/production
3. Implement Option B (WASM) in Q2 if volume justifies it

---

## Action Items

- [ ] **Decision needed:** Fix in current PR (Option 1) or separate PR (Option 2)?
- [ ] **Decision needed:** Use CF Images Upload API (Option A) or WASM (Option B) for normalization?
- [ ] **If Option A:** Set up CF Images API token and update wrangler.jsonc
- [ ] **If Option B:** Add WASM dependencies to package.json
- [ ] Implement `normalizeImage()` function
- [ ] Update upload endpoint code (remove 2-step upload)
- [ ] Update tests
- [ ] Manual testing with HEIC files
- [ ] Update documentation (plan.md, summary)
- [ ] Update PR description with alignment notes

---

**Estimated effort:**
- Option A (CF Images Upload): **4-6 hours**
- Option B (WASM): **2-3 days**

**Priority:** **HIGH** - Current implementation doesn't match approved plan
