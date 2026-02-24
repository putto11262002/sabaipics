# Research: HEIC Support in AWS Rekognition

**RootId**: `BS_0001_S-1`
**Topic**: `heic-rekognition`
**Date**: 2026-01-09
**Updated**: 2026-01-09 (confirmed HEIC support via official Cloudflare changelog)
**Status**: Complete
**Blocking**: Yes (US-7, US-8)

---

## 1. Decision Frame + Constraints

### Research question

Does AWS Rekognition IndexFaces accept HEIC images directly, or do we need to convert to JPEG/PNG first? If conversion is needed, what are the options in a Cloudflare Workers environment?

### Constraints

- **Requirements**: US-7 requires JPEG/PNG/HEIC/WebP upload support (max 5MB); US-8 requires automatic face detection via AWS Rekognition
- **Architecture**: Hono API on Cloudflare Workers, photos stored in R2, queue consumer calls Rekognition
- **Environment**: Cloudflare Workers runtime (no native image processing libs like sharp)
- **Security**: Photos are user-uploaded, must validate before processing
- **Worker size limit**: 10 MB compressed (paid plan), 3 MB (free plan)

---

## 2. Repo-first Grounding

### Existing Rekognition implementation

Located at `apps/api/src/lib/rekognition/`:

**`client.ts`** - Current implementation:

```typescript
export async function indexFaces(
  client: RekognitionClient,
  eventId: string,
  imageBytes: ArrayBuffer, // <-- Raw bytes passed directly
  photoId: string,
): Promise<IndexFacesResult> {
  const command = new IndexFacesCommand({
    CollectionId: collectionId,
    Image: {
      Bytes: new Uint8Array(imageBytes), // <-- No format conversion
    },
    // ...
  });
}
```

**`errors.ts`** - Already handles format errors:

```typescript
const NON_RETRYABLE_ERROR_NAMES = new Set([
  'InvalidImageFormatException', // <-- Will be thrown for HEIC
  // ...
]);
```

### Observation

The current implementation passes raw image bytes directly to Rekognition. No format detection or conversion exists. HEIC uploads will fail with `InvalidImageFormatException`.

---

## 3. Gap List

### Must-know (blocking)

1. What image formats does AWS Rekognition accept? **ANSWERED**
2. Does Cloudflare Images support HEIC input and JPEG output? **ANSWERED**
3. Can Cloudflare Images Transform be called from Workers? **ANSWERED**
4. What are the size/memory constraints for WASM-based conversion? **ANSWERED**

### Nice-to-know (non-blocking)

1. Client-side HEIC conversion feasibility (browser support)
2. Performance comparison between conversion options
3. Cost implications of Cloudflare Images vs self-hosted

---

## 4. Tiered Evidence

### Tier A: AWS Rekognition Official Documentation

**Source**: [AWS Rekognition Limits](https://docs.aws.amazon.com/rekognition/latest/dg/limits.html)

> "Amazon Rekognition supports the PNG and JPEG image formats. That is, the images you provide as input to various API operations, such as `DetectLabels` and **`IndexFaces`** must be in one of the supported formats."

**Verdict**: **HEIC is NOT supported**. Rekognition only accepts PNG and JPEG.

Additional limits:

- Maximum image size as raw bytes: **5 MB** (aligns with US-7 requirement)
- Maximum image size from S3: 15 MB

### Tier B: HEIC/HEIF Format Specifications

HEIC (High Efficiency Image Container) uses HEVC (H.265) compression. Key facts:

- Native format on iOS devices since iOS 11 (2017)
- Not supported by most web browsers natively
- Requires decoding before use in most backend services

### Tier C: Conversion Options for Cloudflare Workers

#### Option 1: Cloudflare Images Transform

**Source**: [Cloudflare Images Transform Docs](https://developers.cloudflare.com/images/transform-images/), [Cloudflare Upload Images](https://developers.cloudflare.com/images/upload-images/)

**Official Changelog Confirmation** (2026):

> "HEIC support in Cloudflare Images: You can use Images to ingest HEIC images and serve them in supported output formats like AVIF, WebP, JPEG, and PNG."

Supported input formats (per official docs):

- PNG, GIF (including animations), JPEG, WebP (including animated), SVG, **HEIC**

Supported output formats:

- AVIF, WebP, JPEG, baseline-jpeg, PNG, JSON (metadata only)

Upload limits:

- Max dimension: 12,000 px
- Max area: 100 megapixels
- Max file size: 10 MB
- Metadata limit: 1024 bytes

**Key capability**: "Cloudflare can ingest HEIC images for decoding, but they must be served in web-safe formats such as AVIF, WebP, JPG, or PNG."

**Source**: [Transform via Workers](https://developers.cloudflare.com/images/transform-images/transform-via-workers/)

Workers integration example:

```typescript
fetch(imageURL, {
  cf: {
    image: {
      format: 'jpeg',
      quality: 85,
      fit: 'scale-down',
      width: 4096, // Max for Rekognition
    },
  },
});
```

**Requirements**:

- Zone must have Image Transformations enabled
- Image must be accessible via URL (can use R2 public URL or signed URL)
- Transformed images are cached

#### Option 2: WASM-based Conversion (libheif-js)

**Source**: [libheif-js on npm](https://www.npmjs.com/package/libheif-js), [Bundlephobia](https://bundlephobia.com/package/libheif-js)

Package size:

- Minified: **2.0 MB**
- Gzipped: **507.9 kB**

**Source**: [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)

Worker size limits:

- Free plan: 3 MB compressed
- Paid plan: **10 MB compressed**

**Verdict**: libheif-js (508 kB gzipped) fits within the 10 MB paid plan limit, but:

- Adds significant bundle size (~500 kB)
- CPU-intensive decoding in Workers (limited to 5 min CPU time, but HEIC decode is typically <1s)
- Memory limit is 128 MB per isolate (should be sufficient for single image)

#### Option 3: External Conversion Service (imgproxy)

**Source**: [imgproxy documentation](https://docs.imgproxy.net/), [Features](https://imgproxy.net/features/)

imgproxy supports:

- Input: JPEG, PNG, WebP, AVIF, JPEG XL, GIF, SVG, ICO, **HEIC**, BMP, TIFF
- Output: Same formats

**Deployment options**:

- Self-hosted Docker container
- Managed service (imgproxy.net)

**Integration pattern**:

```
Worker -> imgproxy (HEIC->JPEG) -> R2 (store converted) -> Rekognition
```

#### Option 4: Client-side Conversion

**Source**: [heic2any](https://github.com/alexcorvi/heic2any), [heic-to](https://github.com/hoppergee/heic-to)

Libraries available:

- `heic2any` - Browser-side WASM conversion
- `heic-to` - Similar, actively maintained

**Considerations**:

- Only works on devices with sufficient compute (modern phones/laptops)
- Conversion happens before upload, reducing server load
- User experience impact: conversion delay before upload starts

---

## 5. Option Synthesis

### Option A: Cloudflare Images Transform (Recommended)

**Approach**: Use Cloudflare Image Transformations to convert HEIC to JPEG on-the-fly before sending to Rekognition.

**Flow**:

```
1. Upload original (HEIC/JPEG/PNG/WebP) to R2
2. Queue consumer fetches via CF Images Transform URL with format=jpeg
3. Transformed JPEG bytes sent to Rekognition IndexFaces
4. Original preserved in R2 for high-quality downloads
```

**Implementation**:

```typescript
// In queue consumer
async function getImageForRekognition(r2Key: string, env: Env): Promise<ArrayBuffer> {
  const r2Url = `https://${env.R2_PUBLIC_DOMAIN}/${r2Key}`;

  const response = await fetch(r2Url, {
    cf: {
      image: {
        format: 'jpeg',
        quality: 90,
        fit: 'scale-down',
        width: 4096,
        height: 4096,
      },
    },
  });

  if (!response.ok) {
    throw new ImageTransformError(`Transform failed: ${response.status}`);
  }

  return response.arrayBuffer();
}
```

| Pros                                | Cons                                      |
| ----------------------------------- | ----------------------------------------- |
| Native Cloudflare integration       | Requires Image Transformations add-on ($) |
| No bundle size impact               | Adds latency for transform (~100-500ms)   |
| Handles all input formats uniformly | R2 objects need public/signed URL access  |
| Edge caching of transformed images  |                                           |
| Preserves original quality in R2    |                                           |

**Prerequisites**:

- Enable Image Transformations on zone
- Configure R2 bucket for public access or use signed URLs
- Handle transform errors gracefully

**Cost**: Cloudflare Images pricing (check current rates)

**Risk**: Low - Uses stable Cloudflare APIs

---

### Option B: Queue-time WASM Conversion (libheif-js)

**Approach**: Bundle libheif-js WASM in the queue consumer Worker, convert HEIC to JPEG in-Worker before Rekognition call.

**Flow**:

```
1. Upload original to R2
2. Queue consumer downloads from R2
3. If HEIC: decode with libheif-js, encode to JPEG
4. Send JPEG to Rekognition
```

| Pros                             | Cons                                         |
| -------------------------------- | -------------------------------------------- |
| Self-contained, no external deps | +500 kB bundle size                          |
| No Cloudflare Images cost        | CPU-intensive, impacts cold start            |
| Works offline/isolated           | Need separate JPEG encoder (canvas-like API) |
|                                  | Memory pressure for large images             |
|                                  | Complexity: WASM init, error handling        |

**Prerequisites**:

- Bundle libheif-js with Worker
- Add JPEG encoding library (e.g., jpeg-js)
- Test memory/CPU limits with large images

**Risk**: Medium - WASM in Workers is mature but adds complexity

---

### Option C: Client-side Conversion + Server Validation

**Approach**: Convert HEIC to JPEG in browser before upload. Server validates format and rejects unconverted HEIC.

**Flow**:

```
1. User selects HEIC file
2. Browser detects HEIC, converts to JPEG using heic2any
3. Upload JPEG to server
4. Server validates: reject if HEIC/unsupported
5. Normal flow: R2 -> Queue -> Rekognition
```

| Pros                                  | Cons                                 |
| ------------------------------------- | ------------------------------------ |
| Zero server-side conversion cost      | User experience: conversion delay    |
| Smaller uploads (JPEG < HEIC usually) | Browser compatibility concerns       |
| Simpler server implementation         | Can't enforce (user could bypass)    |
|                                       | Original quality lost before storage |

**Prerequisites**:

- Add heic2any to dashboard bundle
- Implement client-side format detection
- Add server-side format validation

**Risk**: Medium - Browser support varies, UX impact

---

### Option D: Hybrid (Client + Server Fallback)

**Approach**: Client attempts conversion; server has Cloudflare Images fallback.

**Flow**:

```
1. Client attempts HEIC->JPEG if capable
2. If client conversion fails, upload original HEIC
3. Server detects HEIC, uses CF Images Transform
4. Queue consumer uses transformed URL
```

| Pros                 | Cons                       |
| -------------------- | -------------------------- |
| Best of both worlds  | Implementation complexity  |
| Graceful degradation | Two code paths to maintain |
| Works on all devices |                            |

**Risk**: Higher complexity for marginal benefit

---

## 6. Open Questions

### Answered

1. **Does Rekognition accept HEIC?** No. JPEG and PNG only.
2. **Can CF Images Transform be called from Workers?** Yes, via `fetch()` with `cf.image` options.
3. **What's the libheif-js bundle size?** ~508 kB gzipped, fits in 10 MB Worker limit.

### Requires HI Decision

1. **Cost tolerance**: Is Cloudflare Images Transform cost acceptable?
2. **UX preference**: Is client-side conversion delay acceptable for HEIC uploads?
3. **Original preservation**: Must we preserve original HEIC, or is JPEG sufficient?

### Requires Further Research (non-blocking)

1. Exact Cloudflare Images Transform pricing for expected volume
2. Cold start impact of bundling libheif-js (~500 kB WASM)

---

## 7. Recommendation

**Primary recommendation: Option A (Cloudflare Images Transform)**

Rationale:

1. **Native integration** - Cloudflare-to-Cloudflare, minimal latency
2. **No bundle impact** - Workers stay lean, fast cold starts
3. **Unified handling** - Same code path for all formats (JPEG, PNG, WebP, HEIC)
4. **Original preservation** - Store original in R2, transform on-demand
5. **Future-proof** - CF Images supports new formats as they add them

**Implementation notes**:

- Detect format on upload (magic bytes or extension)
- Store original in R2 regardless of format
- Queue consumer always fetches via CF Images Transform URL with `format=jpeg`
- Handle transform errors: retry or mark photo as failed
- Consider caching strategy for transformed images

**Fallback consideration**:
If Cloudflare Images cost is prohibitive, Option C (client-side) is viable for MVP, with Option A as future enhancement.

---

## 8. References

- AWS Rekognition Limits: https://docs.aws.amazon.com/rekognition/latest/dg/limits.html
- AWS Rekognition API Image: https://docs.aws.amazon.com/rekognition/latest/dg/API_Image.html
- Cloudflare Images Transform: https://developers.cloudflare.com/images/transform-images/
- Cloudflare Transform via Workers: https://developers.cloudflare.com/images/transform-images/transform-via-workers/
- Cloudflare Upload Images (supported formats): https://developers.cloudflare.com/images/upload-images/
- Cloudflare Changelog (HEIC support): https://developers.cloudflare.com/changelog/
- Cloudflare Workers Limits: https://developers.cloudflare.com/workers/platform/limits/
- libheif-js npm: https://www.npmjs.com/package/libheif-js
- heic2any: https://github.com/alexcorvi/heic2any
- imgproxy: https://imgproxy.net/
- photon WASM Library: https://github.com/silvia-odwyer/photon
- libheif: https://github.com/strukturag/libheif

---

## 9. Research Notes (2026-01-09 Update)

### Key Evidence Updates

1. **AWS Rekognition Format Confirmation**: Verified via official AWS documentation that Rekognition IndexFaces only supports PNG and JPEG formats. Quote from limits page: "Amazon Rekognition supports the PNG and JPEG image formats."

2. **Cloudflare Images HEIC Support**: Confirmed via official Cloudflare changelog that HEIC is now a supported input format. The service can ingest HEIC and transform to JPEG/PNG/WebP/AVIF output formats.

3. **WebP Note**: WebP is also NOT supported by Rekognition, so the same conversion approach (Option A) handles both HEIC and WebP uniformly.

4. **Transformation Caching**: Cloudflare Images caches unique transformations for 30 days, meaning the same image+parameters combination is only billed once within that period.

### Implementation Path Forward

Given the confirmation that:

- Rekognition only accepts JPEG/PNG
- Cloudflare Images accepts HEIC input and outputs JPEG

**Option A (Cloudflare Images Transform)** remains the recommended approach. The implementation should:

1. Store original files in R2 (preserve HEIC/WebP originals)
2. Use Cloudflare Images Transform URL with `format=jpeg` when fetching for Rekognition
3. Handle both HEIC and WebP with the same code path
