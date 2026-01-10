# Research: R2 Presigned URLs for Gallery API

**Root ID**: `BS_0001_S-1`
**Topic**: `r2-presigned-urls`
**Date**: 2026-01-10
**Blocking**: Yes (T-18: Gallery API download URL generation)

---

## 1. Decision Context

**Question**: How to generate secure download URLs for R2 objects while enabling edge caching for thumbnails?

**Constraints**:
- Cloudflare Workers runtime (not Node.js)
- Need edge caching for transform URLs (thumbnails/previews)
- Need time-limited access for download URLs (prevent hotlinking)

---

## 2. Evidence Summary

### Key Finding: Presigned URLs Don't Work with Custom Domains

**From [Presigned URLs · Cloudflare R2 docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/):**

> **Custom domains**
> Presigned URLs work with the S3 API domain (`<ACCOUNT_ID>.r2.cloudflarestorage.com`) and cannot be used with custom domains.

### Key Finding: CF Images Caching is Automatic

**From [Transform via URL · Cloudflare Images docs](https://developers.cloudflare.com/images/transform-images/transform-via-url/):**

> Transformed images are cached on Cloudflare's edge. Only the original is stored in R2.

CF Images automatically caches transformed variants at the edge with:
- Cache key = source URL + transform parameters
- Min 1 hour cache duration
- Subsequent requests served from cache (~10-50ms)

---

## 3. Resolution for T-18: Hybrid Approach

| URL Type | Strategy | Why |
|----------|----------|-----|
| `thumbnailUrl` (400px) | Public CF Images transform URL | Edge caching, fast loads |
| `previewUrl` (1200px) | Public CF Images transform URL | Edge caching, fast loads |
| `downloadUrl` (full) | Presigned R2 URL (15 min expiry) | Prevent hotlinking abuse |

**Rationale:**
- Transform URLs benefit from edge caching (automatic with CF Images)
- Download URLs need protection (presigned URLs expire)
- API-level access control is enforced first (ownership check)

---

## 4. Implementation

### Package Dependency

Add `aws4fetch` to `apps/api/package.json`:

```bash
pnpm --filter=@sabaipics/api add aws4fetch
```

This library is Workers-compatible and specifically designed for AWS signature generation in edge environments.

### URL Generation Functions

```typescript
import { AwsClient } from 'aws4fetch';

// Generate presigned URL for download (15 min expiry)
async function generateDownloadUrl(
  env: Env,
  r2Key: string
): Promise<string> {
  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  const bucketUrl = `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/sabaipics-photos/${r2Key}`;

  const signedRequest = await aws.sign(bucketUrl, {
    method: 'GET',
    aws: { signQuery: true, expires: 900 }, // 15 minutes
  });

  return signedRequest.url;
}

// Public transform URLs (cached at edge)
function generateThumbnailUrl(r2Key: string, cfDomain: string, r2BaseUrl: string): string {
  return `${cfDomain}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${r2BaseUrl}/${r2Key}`;
}

function generatePreviewUrl(r2Key: string, cfDomain: string, r2BaseUrl: string): string {
  return `${cfDomain}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${r2BaseUrl}/${r2Key}`;
}
```

---

## 5. Configuration Added to wrangler.jsonc

Environment variables added to all environments:

| Variable | Development | Staging | Production | Purpose |
|----------|-------------|---------|------------|---------|
| `CF_DOMAIN` | `https://sabaipics.com` | `https://sabaipics.com` | `https://sabaipics.com` | Zone with Images enabled |
| `R2_BASE_URL` | R2 dev URL | `https://photos-staging.sabaipics.com` | `https://photos.sabaipics.com` | R2 bucket domain |

### Secrets (set via `wrangler secret put`)

Required for presigned URL generation:

```bash
# Get R2 API Token from: Cloudflare Dashboard → R2 → Manage R2 API Tokens
pnpm --filter=@sabaipics/api wrangler secret put R2_ACCESS_KEY_ID
pnpm --filter=@sabaipics/api wrangler secret put R2_SECRET_ACCESS_KEY
pnpm --filter=@sabaipics/api wrangler secret put CLOUDFLARE_ACCOUNT_ID
```

---

## 6. Response Shape

```typescript
{
  data: [{
    id: string,
    thumbnailUrl: string,  // CF Images transform (public, cached)
    previewUrl: string,    // CF Images transform (public, cached)
    downloadUrl: string,   // Presigned R2 URL (expires 15 min)
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

---

## 7. Decision Record

**Status**: Research complete, decision made

**Decision**: Use **hybrid approach** for T-18:
- Public CF Images transform URLs for thumbnails/previews (edge caching)
- Presigned R2 URLs for downloads (prevents hotlinking)

**Rationale**:
- Transform URLs benefit from edge caching (automatic with CF Images)
- Download URLs need protection (presigned URLs expire after 15 min)
- API-level access control is enforced first (ownership check before any URLs returned)

**Configuration complete:**
- ✅ `wrangler.jsonc` updated with CF_DOMAIN and R2_BASE_URL
- ✅ `types.ts` updated with secret bindings
- ✅ `.dev.vars.example` updated with setup instructions

**Future consideration**: If presigned URLs are not needed, can switch to direct custom domain URLs for all three URL types.

---

## 8. References

- [Presigned URLs · Cloudflare R2 docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Transform via URL · Cloudflare Images docs](https://developers.cloudflare.com/images/transform-images/transform-via-url/)
- [Building Cloudflare R2 Pre-signed URL Uploads with Hono](https://lirantal.com/blog/cloudflare-r2-presigned-url-uploads-hono)
- Internal research: `docs/logs/BS_0001_S-1/research/cf-images-thumbnails.md`

---

## Sources

- [Presigned URLs · Cloudflare R2 docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Building Cloudflare R2 Pre-signed URL Uploads with Hono](https://lirantal.com/blog/cloudflare-r2-presigned-url-uploads-hono)
- [Transform via URL · Cloudflare Images docs](https://developers.cloudflare.com/images/transform-images/transform-via-url/)
