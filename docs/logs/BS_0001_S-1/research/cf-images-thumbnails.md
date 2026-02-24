# Research: Cloudflare Images Thumbnails from R2

**Root ID**: `BS_0001_S-1`
**Topic**: `cf-images-thumbnails`
**Date**: 2026-01-09
**Blocking**: Yes (US-9: Event gallery displays photos with face counts)

---

## 1. Decision Context

**Question**: Can Cloudflare Images generate thumbnails from photos stored in R2? What are the integration options and costs?

**Constraints**:

- Photos are stored in R2 bucket `sabaipics-photos` (configured in `apps/api/wrangler.jsonc`)
- Gallery grid (US-9) needs thumbnails for fast page loads with potentially hundreds of photos
- Architecture uses Hono API on Cloudflare Workers
- Must work within Cloudflare ecosystem (no external image CDN)
- Performance is critical for Thai market (mobile-heavy usage)

**Upstream requirement**: US-9 acceptance criteria include "gallery should load quickly with many photos"

---

## 2. Repo Grounding

**Current R2 configuration** (`apps/api/wrangler.jsonc`):

```jsonc
"r2_buckets": [
  {
    "binding": "PHOTOS_BUCKET",
    "bucket_name": "sabaipics-photos"
  }
]
```

**Domain setup**:

- Staging: `api-staging.sabaipics.com` (zone: `sabaipics.com`)
- Production: `api.sabaipics.com` (zone: `sabaipics.com`)

**Existing patterns**:

- Photos uploaded directly to R2 via Workers
- No current image transformation logic exists
- Photo queue consumer exists for face detection (can be extended)

---

## 3. Evidence Summary

### Tier A: Primary Documentation (Cloudflare Docs)

**Cloudflare Images Transformations** is the official solution for on-the-fly image resizing. Key findings:

1. **Works with R2**: Cloudflare explicitly documents R2 as a supported source for image transformations. The reference architecture "Optimizing image delivery with Cloudflare image resizing and R2" confirms this is a supported pattern.

2. **Two integration methods**:
   - **URL-based**: `/cdn-cgi/image/width=200,quality=75/<source-image-path>`
   - **Worker-based**: `fetch(imageURL, { cf: { image: { width: 200, quality: 75 } } })`

3. **Automatic caching**: Transformed images are cached on Cloudflare's edge. Only the original is stored in R2.

4. **Zone requirement**: Transformations must be enabled per-zone in Cloudflare dashboard (Images > Transformations > Enable for zone).

### Tier B: Technical Specifications

**Transform options relevant for thumbnails**:

- `width` / `height`: Max dimensions (e.g., `width=200` for gallery grid)
- `fit=scale-down`: Never enlarges, only shrinks (recommended for thumbnails)
- `fit=cover`: Crops to fill exact dimensions (good for uniform grid)
- `quality=75`: Balanced quality/size (default 85)
- `format=auto`: Serves WebP/AVIF to supported browsers
- `gravity=face`: Centers crop on detected faces (useful for event photos!)

**Format support**:

- Input: JPEG, PNG, GIF, WebP, AVIF, **HEIC** (confirmed supported)
- Output: JPEG, PNG, GIF, WebP, AVIF (auto-negotiation available)
- **HEIC IS SUPPORTED**: Official docs state "Cloudflare can ingest HEIC images for decoding, but they must be served in web-safe formats such as AVIF, WebP, JPG, or PNG." This resolves the HEIC question - no pre-conversion needed before transformation.

**AVIF output limits** (important for thumbnail sizing):

- Hard limit: 1,200px on longest side (1,600px when `format=avif` explicitly used)
- Soft limit (under load): 640px on longest side
- For thumbnails at 200px, this is not a concern

**Caching behavior**:

- Transformed images cached min 1 hour
- Original image cached per standard HTTP caching rules
- Cache key is based on source URL + transformation params
- Purging original URL purges all variants

### Tier C: Pricing & Limitations

**Pricing (Images Free plan is available)**:
| Metric | Price |
|--------|-------|
| First 5,000 unique transformations/month | **FREE** (included in Free plan) |
| Additional transformations | $0.50 / 1,000 unique transformations |
| R2 storage | $0.015 / GB-month (after 10GB free) |
| R2 Class B operations (reads) | $0.36 / million (after 10M free) |

**Key insight**: The Images Free plan provides 5,000 unique transformations/month at no cost. No Images Paid plan subscription required for transformations only. The Paid plan ($5/month) is only needed if you want to store images IN Cloudflare Images (not R2).

**Important**: A "unique transformation" is counted per 30-day sliding window. Same image+params = 1 billable event per 30 days.

**Cost estimate for SabaiPics**:

- Scenario: 10,000 photos, 2 sizes each (thumbnail 200px, preview 800px)
- Unique transformations: 20,000
- Monthly cost: (20,000 - 5,000) / 1,000 \* $0.50 = **$7.50/month**
- R2 storage for 10K photos @ 3MB avg: 30GB = $0.30/month
- **Total: ~$8/month** for modest scale

**Limitations**:

- Max source image: 100MP or 70MB (ample for photos)
- No support for `/cdn-cgi/` URL purging individually
- HEIC input supported but must output as web-safe format (JPEG/PNG/WebP/AVIF)
- Transformations tied to zone (need `sabaipics.com` zone active)
- AVIF output has size limits (max 1,200px, soft limit 640px under load)

---

## 4. Options Analysis

### Option A: Cloudflare Images URL-based Transformations (Recommended)

**How it works**:

1. Enable transformations on `sabaipics.com` zone
2. Configure R2 bucket domain as allowed origin (or use same-zone subdomain)
3. Serve R2 images via custom domain (e.g., `photos.sabaipics.com`)
4. Transform via URL: `/cdn-cgi/image/width=200,fit=cover,format=auto/photos.sabaipics.com/{r2-key}`

**Pros**:

- Zero code for basic thumbnails (URL rewrite only)
- Automatic caching at edge
- Format negotiation (WebP/AVIF)
- Face-aware cropping (`gravity=face`) included
- Predictable pricing
- Native Cloudflare integration

**Cons**:

- Requires R2 public access or custom domain setup
- Zone-level feature toggle (ops dependency)
- Cannot transform private/signed R2 URLs via URL method (need Worker)

**Prerequisites**:

- Enable Images transformations on `sabaipics.com` zone
- Set up R2 custom domain (e.g., `photos.sabaipics.com`) OR add R2 public URL to allowed origins
- Update photo URL generation to use transform URLs

**Risk**: Low - this is the documented pattern

---

### Option B: Worker-based Transformations (for private R2)

**How it works**:

1. Worker fetches image from R2 bucket binding
2. Worker returns fetch with `cf.image` options
3. Cloudflare transforms and caches

```typescript
// Example: /photos/:eventId/:photoId/thumbnail
app.get('/photos/:eventId/:photoId/thumbnail', async (c) => {
  const key = `events/${c.req.param('eventId')}/${c.req.param('photoId')}.jpg`;
  const object = await c.env.PHOTOS_BUCKET.get(key);

  if (!object) return c.notFound();

  // Transform via Worker
  const response = await fetch(`https://photos.sabaipics.com/${key}`, {
    cf: {
      image: {
        width: 200,
        height: 200,
        fit: 'cover',
        format: 'auto',
        quality: 75,
      },
    },
  });

  return response;
});
```

**Pros**:

- Works with private R2 buckets (no public access needed)
- Full programmatic control over transform params
- Can add auth/validation before transformation
- Can implement custom URL schemes

**Cons**:

- More code to maintain
- Worker execution cost (minimal)
- Slightly higher latency on cache miss (Worker + transform)
- Must prevent infinite loops (check `Via: image-resizing` header)

**Prerequisites**:

- Same zone setup as Option A
- Worker code for image proxy
- R2 public domain OR internal fetch path

**Risk**: Low-Medium - more moving parts but well-documented

---

### Option C: Pre-generate Thumbnails on Upload

**How it works**:

1. When photo uploaded to R2, queue job for thumbnail generation
2. Use Cloudflare Worker + sharp-wasm or Photon for local processing
3. Store thumbnail as separate R2 object (e.g., `{key}_thumb.jpg`)
4. Serve thumbnails directly from R2

**Pros**:

- No per-request transformation cost
- Thumbnails always ready (no cold-start)
- Works offline from Cloudflare Images
- Full control over output

**Cons**:

- **Significantly more storage** (2x+ R2 objects per photo)
- More complex upload pipeline
- sharp/Photon WASM in Workers has limitations (memory, CPU time)
- No automatic format negotiation
- Must regenerate if thumbnail spec changes
- Upload latency increases

**Prerequisites**:

- Add image processing library (sharp-wasm or Photon)
- Extend queue consumer for thumbnail generation
- Update DB schema for thumbnail_key
- Update storage cleanup logic

**Risk**: Medium-High - more complexity, higher storage cost, known Worker limitations with image libs

---

### Option D: Hybrid (Pre-generate + On-demand)

**How it works**:

- Pre-generate common thumbnail size (200px) on upload
- Use Cloudflare Images for other sizes (preview, full)

**Pros**:

- Fastest gallery loads (pre-generated)
- Flexibility for other sizes

**Cons**:

- Combines complexity of both approaches
- Overkill for MVP

**Risk**: Medium - unnecessary complexity for current requirements

---

## 5. Recommendation

**Recommended: Option A (URL-based Transformations)** for MVP

**Rationale**:

1. **Simplest integration**: Only requires zone configuration + URL changes
2. **Cost-effective**: ~$8/month at 10K photos scale
3. **Performance**: Edge caching ensures fast subsequent loads
4. **Face-aware cropping**: `gravity=face` is a bonus feature perfect for event photos
5. **Format negotiation**: Automatic WebP/AVIF reduces bandwidth
6. **Cloudflare-native**: No external dependencies, aligns with existing stack

**If private R2 required**: Fall back to Option B (Worker-based) with minimal additional code.

**Not recommended for MVP**: Option C (pre-generation) due to complexity and storage overhead.

---

## 6. Implementation Sketch (Option A)

### Setup (One-time)

1. **Cloudflare Dashboard**:
   - Go to Images > Transformations
   - Select `sabaipics.com` zone
   - Click "Enable for zone"
   - Add R2 custom domain to allowed origins (if using separate subdomain)

2. **R2 Custom Domain** (recommended):
   - Go to R2 > `sabaipics-photos` bucket > Settings > Public access
   - Add custom domain: `photos.sabaipics.com`
   - This makes R2 objects accessible via `https://photos.sabaipics.com/{key}`
   - **Benefits of custom domain over r2.dev subdomain**:
     - Enables Cloudflare Cache for acceleration
     - Enables WAF, bot management, access controls
     - Required for production use (r2.dev is for development only)
   - **Note**: Custom domain must be on a zone already in Cloudflare (sabaipics.com is active)

### Code Changes

**API: Photo URL generation** (`apps/api`):

```typescript
// Helper to generate thumbnail URL
function getThumbnailUrl(r2Key: string, width = 200): string {
  const baseUrl = 'https://photos.sabaipics.com';
  // URL-based transformation
  return `https://sabaipics.com/cdn-cgi/image/width=${width},fit=cover,format=auto,quality=75/${baseUrl}/${r2Key}`;
}

// In GET /events/:id/photos response
{
  photos: photos.map((p) => ({
    id: p.id,
    thumbnailUrl: getThumbnailUrl(p.r2_key, 200),
    previewUrl: getThumbnailUrl(p.r2_key, 800),
    fullUrl: `https://photos.sabaipics.com/${p.r2_key}`,
    faceCount: p.face_count,
    status: p.status,
  }));
}
```

**UI: Gallery grid** (`apps/dashboard`):

```tsx
// Gallery uses thumbnailUrl for grid, previewUrl for lightbox
<img src={photo.thumbnailUrl} loading="lazy" width={200} height={200} alt={`Photo ${photo.id}`} />
```

---

## 7. Open Questions

| #     | Question                                                    | Impact                      | Owner                   | Status                          |
| ----- | ----------------------------------------------------------- | --------------------------- | ----------------------- | ------------------------------- |
| 1     | Is R2 public access acceptable, or must we use signed URLs? | Determines Option A vs B    | Product/Security        | Open                            |
| 2     | What thumbnail dimensions for gallery grid?                 | URL params                  | Design                  | Open                            |
| 3     | Should we use face-aware cropping for thumbnails?           | URL params (`gravity=face`) | Product                 | Open                            |
| ~~4~~ | ~~Is HEIC input required? (CF Images may not support)~~     | ~~Blocks HEIC photos~~      | ~~Ties to Decision #2~~ | **RESOLVED: HEIC is supported** |

**Resolution for Q4**: Cloudflare Images officially supports HEIC input. HEIC photos can be transformed to thumbnails without pre-conversion. Output must be web-safe format (JPEG/PNG/WebP/AVIF), which `format=auto` handles automatically.

---

## 8. References

- [Cloudflare Images Overview](https://developers.cloudflare.com/images/)
- [Cloudflare Images Pricing](https://developers.cloudflare.com/images/pricing/)
- [Transform via URL](https://developers.cloudflare.com/images/transform-images/transform-via-url/)
- [Transform via Workers](https://developers.cloudflare.com/images/transform-images/transform-via-workers/)
- [Reference Architecture: R2 + Image Resizing](https://developers.cloudflare.com/reference-architecture/diagrams/content-delivery/optimizing-image-delivery-with-cloudflare-image-resizing-and-r2/)
- [Define Source Origins](https://developers.cloudflare.com/images/transform-images/sources/)

---

## 9. Decision Record

**Status**: Research complete, awaiting human decision

**Last Updated**: 2026-01-09 (validated against current Cloudflare documentation)

**Validation**: Cloudflare Images CAN generate thumbnails from R2-stored photos. This is an officially documented and supported pattern (see Reference Architecture link).

**Key findings**:

1. **HEIC support confirmed**: Cloudflare can ingest HEIC for transformation (outputs web-safe formats)
2. **Free tier available**: 5,000 unique transformations/month included free (no paid subscription required)
3. **R2 custom domain recommended**: Enables caching, WAF, and production-ready access
4. **Face-aware cropping available**: `gravity=face` parameter centers crops on detected faces

**Answer to research question**: Yes, Cloudflare Images supports generating thumbnails from R2. The recommended approach is URL-based transformations with R2 custom domain. Cost is approximately $0.50/1,000 unique transformations after 5,000 free tier. Integration requires zone-level enablement and URL changes in photo serving logic.

**DoD alignment**: <2s p95 load time is achievable with edge caching. First request may be slower (transformation + R2 fetch), but subsequent requests serve from cache. For gallery grids with many photos, lazy loading (`loading="lazy"`) is recommended.
