# Log 007: Image Pipeline (Validation + Normalization) - RESOLUTION

**Status:** RESOLVED
**Opened:** 2025-12-01
**Resolved:** 2025-12-01
**Context:** [API Backend decision (log/006)](006_backend_decision.md) requires image processing before storage

---

## The Decision

**Image Pipeline:** Cloudflare Workers / Cloudflare Images
**Purpose:** Image validation, normalization, resize, compress, format optimization

---

## What the Pipeline Does

### Core Functions (Defined)

1. **Validation**
   - Check file is valid image (JPG, PNG, WebP, etc.)
   - Check file size within limits
   - Check dimensions reasonable (not 1px × 1px, etc.)
   - Reject invalid/corrupted files early

2. **Normalization**
   - Convert to standard format (WebP preferred for web)
   - Standardize color space (sRGB)
   - Strip metadata (EXIF, copyright, etc.) for privacy
   - Normalize orientation (always upright)

3. **Optimization**
   - Resize for different uses:
     - Thumbnail: ~200px width
     - Web view: ~1200px width
     - Full resolution: stored but not displayed
   - Compress aggressively while maintaining quality
   - Reduce file size 50-80% before storage

### Scope TBD (To Be Detailed Later)

- [ ] Exact file size limits per image?
- [ ] Dimension limits (min/max width/height)?
- [ ] Which formats supported (JPG, PNG, WebP, HEIC)?
- [ ] Metadata stripping specifics?
- [ ] Thumbnail/web view exact dimensions?
- [ ] Compression quality settings (quality/size tradeoff)?
- [ ] Watermark or copyright notice addition?

---

## Why Cloudflare Workers / Images?

### Cloudflare Workers (Likely Choice)

**Advantages:**
1. **Runs at edge** - Validate locally before uploading to R2
2. **Lightweight** - Can resize/compress in memory using image libraries
3. **No separate infrastructure** - Part of existing Workers setup
4. **Fast failure** - Reject bad images immediately, save upload bandwidth
5. **Cost-efficient** - Workers CPU-based pricing, no per-request charges

**Flow:**
```
Photographer uploads via Lightroom Plugin
    ↓ (FTP to VPS)
VPS receives image
    ↓ (REST call to Cloudflare Worker)
Cloudflare Worker validates + normalizes
    ↓ (if valid)
Worker generates R2 URLs + metadata
    ↓
Worker stores normalized images in R2 (original + thumbnail + web)
    ↓
Metadata stored in Neon Postgres
```

### Cloudflare Images (Alternative)

**Alternative approach:**
- Cloudflare's managed image optimization service
- Upload original → Cloudflare serves optimized variants
- More managed but less control
- May have additional costs

**Decision:** Likely Workers for MVP (more control, cheaper), evaluate Images in Phase 3b.

---

## Peak Load

**From assumptions:**
- Tier 3: Peak upload 100 MB/min
- Typical event photo: 5 MB
- Peak throughput: ~20 photos/min

**Pipeline requirements:**
- Process 20 photos/min
- Validate each in <3 seconds
- Generate 3 versions (original + thumbnail + web)
- Cloudflare Workers can easily handle this

---

## Integration with Other Decisions

### With Participant Flow (log/001)
- Photographer uploads via Lightroom Plugin
- Pipeline processes images
- Metadata stored for search

### With FTP Server (VPS)
- VPS receives image via FTP
- VPS triggers Cloudflare Worker via REST API
- Worker processes image, stores in R2

### With AWS Rekognition
- After normalization, images stored in R2
- Rekognition can directly read from R2
- Returns face embeddings + metadata

### With Metadata DB (Neon)
- Pipeline stores processing result (sizes, formats, error details)
- Neon tracks which images are processed
- Enables retry logic for failed images

### With Object Storage (R2)
- Pipeline stores 3 versions:
  1. Original (full resolution, for reference)
  2. Thumbnail (200px, for gallery)
  3. Web view (1200px, for participant viewing)

### With CDN (Cloudflare CDN)
- CDN caches processed versions
- Reduces R2 bandwidth usage
- Improves participant load times

---

## Workflow Example

```
1. Photographer imports event photos via Lightroom Plugin
2. Plugin uploads via FTP to t4g.micro VPS
3. VPS receives 5 MB photo
4. VPS calls: POST https://worker.facelink.cloud/process
   - Body: { bucket: "event-123", filename: "photo-001.jpg", ftp_path: "/uploads/..." }
5. Cloudflare Worker:
   - Downloads image from FTP
   - Validates (is it a real JPEG? correct dimensions?)
   - If invalid: return error, photographer sees warning
   - If valid: process image
     - Convert to WebP
     - Generate thumbnail (200px)
     - Generate web view (1200px)
     - Keep original for reference
6. Worker uploads 3 files to R2:
   - r2://photos/event-123/photo-001.original.jpg
   - r2://photos/event-123/photo-001.thumbnail.webp
   - r2://photos/event-123/photo-001.web.webp
7. Worker stores metadata in Postgres:
   - event_id: 123
   - filename: photo-001.jpg
   - processed_at: 2025-12-01T12:00:00Z
   - sizes: { original: 5242880, thumbnail: 45000, web: 125000 }
   - status: "ready"
8. Photographer sees: "Processing... ✓ Photo added to event"
9. Later: Rekognition processes images for face search
10. Participants can then find photos via selfie search
```

---

## Open Questions for Phase 3b

- [ ] Exact dimensions for thumbnail + web view variants?
- [ ] Maximum input image size limit?
- [ ] Minimum dimensions before rejecting?
- [ ] Target compression quality (0-100)?
- [ ] Error handling: retry on failure? notify photographer?
- [ ] Should we add watermark with photographer credit?
- [ ] Should we add copyright notice for privacy?
- [ ] How long to retain original (unprocessed) image?
- [ ] Cost of Cloudflare Workers CPU for image processing?
- [ ] Should we use Cloudflare Images instead for more managed service?

---

## Why Not AWS Lambda?

**Rejected alternatives:**
- **AWS Lambda:** Different vendor, higher latency, additional AWS account management
- **Always-on server:** Not needed for event-driven workload, wastes resources
- **Manual processing:** Photographers shouldn't have to optimize images themselves

**Cloudflare Workers is better because:**
- Consistent with existing Cloudflare stack (Workers, R2, CDN)
- No cold starts
- Runs at edge (lower latency)
- Integrated auth/security

---

## Decision Confirmed

**Image Pipeline:** Cloudflare Workers / Cloudflare Images ✅

**Scope:**
- ✅ Validation (file integrity, dimensions)
- ✅ Normalization (format, metadata stripping)
- ✅ Optimization (resize, compress)
- ⏳ Exact parameters TBD in Phase 3b

**Unblocks:**
- Phase 3a technical analysis 100% complete
- Ready for Phase 3b cost analysis

**Next Steps:**
1. Complete pricing validation (log/002, log/004, log/005)
2. Refine image pipeline exact parameters
3. Cost analysis with all components decided
4. Move to Phase 3b (cost modeling)

---

**Last updated:** 2025-12-01
**Resolved by:** Architecture decision
