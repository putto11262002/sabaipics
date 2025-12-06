# Decision 009: AWS Rekognition Region & API Strategy

**Status:** RESOLVED
**Date Opened:** 2025-12-05
**Date Resolved:** 2025-12-05
**Decision Maker:** Technical Team

---

## Context

AWS Rekognition has **region-dependent TPS (transactions per second) limits** that significantly impact our ability to deliver on the "instant photo distribution" value proposition:

| Region | IndexFaces TPS | SearchFacesByImage TPS |
|--------|----------------|------------------------|
| ap-southeast-1 (Singapore) | 5 TPS | 5 TPS |
| us-west-2 (Oregon) | 50 TPS | 50 TPS |
| us-east-1 (Virginia) | 50 TPS | 50 TPS |

### The Problem

**Original assumption:** Use ap-southeast-1 (Singapore) for lowest latency to Thailand.

**Reality discovered:**
- 500-photo bulk upload at 5 TPS = **100+ seconds minimum** processing time
- 100 concurrent searches at 5 TPS = **20 seconds** (last user waits 20s)
- Multiple concurrent events share the same 5 TPS bottleneck
- **Contradicts "fast delivery" value proposition**

**Additional insight:** IndexFaces API automatically detects AND indexes faces in a single call, making the original two-call architecture (DetectFaces + IndexFaces) unnecessary.

---

## Decision

### Region: us-west-2 (Oregon)

**Rationale:**
1. **10x throughput improvement** (50 TPS vs 5 TPS)
2. **Acceptable latency trade-off** (+150-200ms per call, still meets <3s search target)
3. **Zero additional cost** (R2 egress to AWS is free in all regions)
4. **PDPA compliant** (Thailand PDPA does not require data residency)

### API Strategy: IndexFaces Only

**Rationale:**
1. **IndexFaces does it all** - automatically detects faces AND indexes them
2. **50% fewer API calls** - eliminates need for separate DetectFaces call
3. **Same attributes** - returns all face attributes via `DetectionAttributes: ['ALL']`
4. **Simpler pipeline** - one API call per photo instead of two

---

## Impact

### Throughput Improvements

| Scenario | Singapore (5 TPS) | us-west-2 (50 TPS) | Improvement |
|----------|-------------------|---------------------|-------------|
| 500 photos bulk upload | ~2-3 minutes | ~10-15 seconds | **9-12x faster** |
| 100 concurrent searches | 20s (last user) | 2s (last user) | **10x faster** |
| Single photo process | ~2s | ~2s | Same (latency ≈ equal) |
| 10 concurrent events | Massive queue backlog | Smooth processing | Scalable |

### Cost Impact

**Zero additional cost:**
- Rekognition pricing identical across regions ($1/1,000 images)
- R2 egress to AWS is free (Cloudflare Zero Egress policy)
- Network transfer costs: $0

### Architecture Changes

1. **Queue configuration:**
   - `max_batch_size`: 5 → **25**
   - `max_concurrency`: 1 (unchanged)
   - `max_wait_time_ms`: 0 or omit (immediate dispatch)
   - Effective rate: ~40-45 TPS (safe under 50 TPS limit)

2. **Rate limiting (security):**
   - `/api/search` per-IP: 60/min → **600/min** (10 TPS)
   - `/api/search` global: **1800/min** (30 TPS, leaves 20 TPS headroom)

3. **Processing pipeline:**
   - ❌ Removed: DetectFaces call
   - ✓ Single IndexFaces call with `DetectionAttributes: ['ALL']`

---

## Compliance Considerations

**Thailand PDPA (Personal Data Protection Act):**
- ✓ Does NOT require data to stay in Thailand (unlike China, Russia)
- ✓ Requires: encryption in transit + at rest (AWS provides both)
- ✓ Requires: explicit consent + right to deletion (architecture supports both)
- ✓ Requires: purpose limitation (documented in security design)

**Conclusion:** Using us-west-2 is fully PDPA compliant.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Higher latency per call (+150-200ms) | Still meets <3s search target; users don't notice in practice |
| Increased complexity (cross-region) | Minimal - Rekognition client only needs `region` parameter change |
| AWS outage in us-west-2 | Same risk as Singapore; collections are region-specific so no cross-region failover anyway |
| 50 TPS still exceeded at scale | Request quota increase via AWS Support when sustained >40 TPS |

---

## Performance Targets (Updated)

| Metric | Target | Notes |
|--------|--------|-------|
| Upload response | < 2s | Return `pending` immediately |
| Processing (single photo) | < 2s | IndexFaces + DB updates |
| Processing (500 photos bulk) | ~10-15s | Queue rate-limited to 40-45 TPS |
| Search response | < 3s | SearchFacesByImage + DB lookup |
| Concurrent events supported | 10+ | Without queue backlog |

---

## Implementation Checklist

- [x] Update `dev/tech/05_image_pipeline.md` - us-west-2 config + single IndexFaces call
- [x] Update `dev/tech/08_security.md` - adjust rate limits to 600/min per-IP, 1800/min global
- [x] Update `dev/research/rekognition_collection_pricing.md` - add region-specific TPS
- [x] Document decision in `docs/log/009_aws_region_decision.md`
- [ ] Update `docs/tech/03_tech_decisions.md` - add region to Rekognition entry
- [ ] Update Rekognition client code to use `region: 'us-west-2'`
- [ ] Update queue consumer config: `max_batch_size: 25`, `max_wait_time_ms: 0`
- [ ] Implement Bottleneck rate limiter in queue consumer
- [ ] Update API rate limiting middleware for search endpoints

---

## References

- AWS Rekognition Quotas: https://docs.aws.amazon.com/rekognition/latest/dg/limits.html
- AWS Rekognition IndexFaces API: https://docs.aws.amazon.com/rekognition/latest/APIReference/API_IndexFaces.html
- Cloudflare R2 Pricing (Zero Egress): https://www.cloudflare.com/products/r2/
- Thailand PDPA: https://www.pdpc.gov.sg/overview-of-pdpa/the-legislation/personal-data-protection-act

---

## Alternatives Considered

### 1. Stay in Singapore, request TPS increase
- **Pros:** Lower latency (30-50ms vs 150-200ms)
- **Cons:** AWS may not approve increase; still maxes out at lower ceiling than US regions
- **Rejected:** 10x baseline difference too significant to ignore

### 2. Use us-east-1 (Virginia) instead of us-west-2
- **Pros:** Same 50 TPS as us-west-2
- **Cons:** Slightly higher latency to Thailand (~200-250ms vs ~150-200ms)
- **Rejected:** us-west-2 geographically closer to Asia-Pacific

### 3. Multi-region with automatic failover
- **Pros:** Higher availability, load distribution
- **Cons:** Rekognition collections are region-specific; can't search across regions; adds significant complexity
- **Rejected:** Collections can't span regions, making this impractical

---

## Outcome

**Decision:** Use us-west-2 (Oregon) with IndexFaces-only API strategy.

**Result:** 10x throughput improvement for zero additional cost, resolving the core contradiction with our "fast delivery" value proposition.

**Next Steps:** Implement queue config changes, update rate limiting, and update Rekognition client to use us-west-2.
