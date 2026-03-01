# Research: Cloudflare Upload Limits

**RootId:** BS_0001_S-1
**Topic:** cf-upload-limits
**Date:** 2026-01-09
**Status:** Complete

## Context

We need to accept photo uploads (JPEG/PNG/HEIC/WebP/RAW) on Cloudflare Workers, convert/normalize to JPEG (max 4000px width), and store in R2. This research determines the maximum practical upload size for validation.

---

## Findings

### 1. Cloudflare Workers Request Body Size Limits

**Source:** [Cloudflare Workers Limits Documentation](https://developers.cloudflare.com/workers/platform/limits/)

The request body size limit is tied to your **Cloudflare account plan** (not Workers plan):

| Cloudflare Plan | Maximum Body Size                    |
| --------------- | ------------------------------------ |
| Free            | 100 MB                               |
| Pro             | 100 MB                               |
| Business        | 200 MB                               |
| Enterprise      | 500 MB (default, can request higher) |

**Key notes:**

- Exceeding the limit returns `413 Request Entity Too Large`
- This applies to `POST`/`PUT`/`PATCH` requests
- Enterprise customers can contact support for limits beyond 500 MB

### 2. Cloudflare Images Transformation Limits

**Source:** [Cloudflare Images Transform Documentation](https://developers.cloudflare.com/images/transform-images/)

| Constraint                    | Limit                                     |
| ----------------------------- | ----------------------------------------- |
| Maximum input file size       | **70 MB**                                 |
| Maximum image area            | 100 megapixels (e.g., 10,000 x 10,000 px) |
| GIF/WebP animation total area | 50 megapixels (sum of all frames)         |

**Output format limits:**

| Output Format     | Hard Limit (longest side)       | Soft Limit (longest side)              |
| ----------------- | ------------------------------- | -------------------------------------- |
| AVIF              | 1,200 px (1,600 px if explicit) | 640 px                                 |
| WebP              | N/A                             | 2,560 px (lossy) / 1,920 px (lossless) |
| Other (JPEG, PNG) | 12,000 px                       | N/A                                    |

**Supported input formats:**

- JPEG, PNG, WebP, GIF, AVIF, SVG
- HEIC (can decode for input, must output to web-safe format)
- **RAW formats are NOT natively supported** by Cloudflare Images

### 3. R2 Upload Limits

**Source:** [Cloudflare R2 Error Codes](https://developers.cloudflare.com/r2/api/error-codes/)

| Upload Method                         | Maximum Size |
| ------------------------------------- | ------------ |
| Single PUT upload                     | 5 GiB        |
| Multipart upload (total)              | 5 TiB        |
| Multipart part (minimum, except last) | 5 MiB        |

**Workers binding considerations:**

- When uploading via Workers R2 binding, the **request body limit still applies** (100-500 MB based on plan)
- For files larger than the request body limit, use **multipart uploads** with streaming
- Each part upload is subject to the request body limit

**Third-party reference (R2 Manager Worker):**
| Plan | Practical Max per Request |
|------|---------------------------|
| Free/Pro | 100 MB |
| Business | 200 MB |
| Enterprise | 500 MB |

### 4. RAW File Considerations

RAW files (CR2, NEF, ARW, etc.) present challenges:

- Typical sizes: 25-50 MB (well within limits)
- **Cloudflare Images does NOT support RAW decoding**
- We would need to:
  - Process RAW on client-side before upload, OR
  - Use a separate processing service/library (e.g., dcraw, libraw), OR
  - Use Workers with WASM-based RAW decoder (significant complexity)

**Recommendation:** For MVP, consider limiting to web-friendly formats (JPEG, PNG, HEIC, WebP) and adding RAW support in a future iteration.

---

## Practical Recommendation

### Recommended Maximum Upload Size: **50 MB**

**Rationale:**

1. **Safely within all plan limits:**
   - Free/Pro: 100 MB limit -> 50 MB gives 50% headroom
   - Business: 200 MB limit -> large headroom
   - Enterprise: 500 MB limit -> large headroom

2. **Compatible with Cloudflare Images:**
   - 70 MB limit -> 50 MB is safely under
   - Sufficient for 100+ megapixel images in JPEG/HEIC

3. **Covers typical professional photography:**
   - HEIC: 2-10 MB typical -> covered
   - JPEG: 5-20 MB typical -> covered
   - PNG: 5-30 MB typical -> mostly covered
   - RAW: 25-50 MB typical -> at the limit (but RAW not supported anyway)

4. **User experience:**
   - 50 MB upload on typical broadband (10 Mbps): ~40 seconds
   - Reasonable wait time for professional workflow

### Alternative Consideration: 100 MB

If we want to support larger files (e.g., very high-res PNG exports):

- Works on Free/Pro plans (at the limit)
- Would need to test reliability at boundary
- Adds risk of request failures

### Implementation Notes

```typescript
// Recommended validation constants
export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50 MB
  MAX_IMAGE_DIMENSION: 10000, // 10,000 px (100 megapixels max)
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
  // RAW formats excluded for MVP
  // 'image/x-canon-cr2', 'image/x-nikon-nef', 'image/x-sony-arw'
} as const;
```

### Validation Strategy

1. **Client-side (early rejection):**
   - Check `file.size <= 50MB` before upload
   - Validate MIME type from file extension/magic bytes

2. **Server-side (Workers):**
   - Use Hono body-limit middleware
   - Re-validate file size and type
   - Return `413` for oversized, `415` for unsupported type

3. **Cloudflare Images processing:**
   - Will handle resize to 4000px width
   - Will convert HEIC to JPEG automatically
   - Returns transformed image for R2 storage

---

## Summary Table

| Component               | Limit                       | Our Validation               |
| ----------------------- | --------------------------- | ---------------------------- |
| CF Workers Request Body | 100-500 MB (plan-dependent) | 50 MB                        |
| CF Images Input         | 70 MB                       | 50 MB                        |
| CF Images Area          | 100 megapixels              | 100 megapixels               |
| R2 Single Upload        | 5 GiB                       | N/A (post-transform ~1-5 MB) |
| Supported Formats       | JPEG, PNG, HEIC, WebP, GIF  | JPEG, PNG, HEIC, WebP        |

---

## Sources

- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Images Transform Limits](https://developers.cloudflare.com/images/transform-images/)
- [Cloudflare R2 Error Codes](https://developers.cloudflare.com/r2/api/error-codes/)
- [Cloudflare R2 Workers API Reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Cloudflare R2 Multipart Upload Usage](https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/)
