# Research Log: Cloudflare CDN Pricing Model - Exact Specification

**Status:** IN PROGRESS - PRICING RESEARCH ONLY
**Date Created:** 2025-12-01
**Context:** Decision to use Cloudflare CDN for photo delivery (cached at edge, origin = R2)
**Goal:** Document EXACT pricing model for Cloudflare CDN so we can calculate accurate monthly costs later

---

## 1. What is Cloudflare CDN?

**Cloudflare CDN = Content Delivery Network with 330+ PoPs globally**

**Key for us:**
- Cache processed photos at edge (near participants in Thailand + globally)
- Serve from cache (fast + reduces R2 origin requests)
- Origin = Cloudflare R2 (no egress fees between them)

**Plans available:**
- Free (includes CDN)
- Pro ($20/month)
- Business ($200/month)
- Enterprise (custom)

---

## 2. Cloudflare CDN Pricing Components

### 2.1 Plan-Level Costs

**Free Plan:**
- [ ] Monthly cost: **$0**
- [ ] Bandwidth included: **Unmetered (within ToS)**
- [ ] PoPs available: **All 330+ globally**
- [ ] Features: **Basic caching, HTTPS, etc.**
- [ ] Limitations: **TBD - need to check ToS and fine print**

**Pro Plan ($20/month):**
- [ ] Monthly cost: **$20 USD (฿639)**
- [ ] Bandwidth included: **Unmetered (within ToS)**
- [ ] Additional features vs Free: **TBD**
- [ ] Best for: **Small businesses, expects reliable service**

**Business Plan ($200/month):**
- [ ] Monthly cost: **$200 USD (฿6,392)**
- [ ] Bandwidth included: **Unmetered (within ToS)**
- [ ] Additional features: **SLA, DDoS protection, etc.**
- [ ] Best for: **Larger deployments**

**Key question:**
- [ ] **Is CDN included in plan cost or is there per-GB bandwidth charge?**
- [ ] **OR does "unmetered bandwidth" truly mean $0 per GB?**

---

### 2.2 Bandwidth/Egress Pricing (Most Important for Us)

**The critical question:**

Cloudflare says "plan-based, not per-GB" but need to verify:

- [ ] **Is bandwidth truly unlimited/unmetered?**
- [ ] **Or is there a hidden per-GB cost after certain threshold?**
- [ ] **What counts as "fair use"?**

**From research (`08_cdn_result.md`):**
- Cloudflare CDN pricing is **"plan-based, not per-GB"**
- Free & Pro plans: "unmetered bandwidth within ToS"
- **No published per-GB rate**

**But need to confirm:**
- [ ] Can we serve **1.85 TB/month egress on Free plan?** (Tier 3)
- [ ] Or will Cloudflare throttle/block us for exceeding ToS?
- [ ] What is the ToS threshold before they ask us to upgrade?

---

### 2.3 Cached vs Origin Requests

**Cost model distinction:**

When user requests photo:
1. **Cache hit** (photo cached at edge): Served from cache, **no origin request**
2. **Cache miss** (first request, or cache expired): Origin request to R2, then cached

**Pricing implications:**
- Cloudflare CDN charges: Based on bandwidth served to users (cache hits)
- R2 charges: Based on origin requests (cache misses)
- **We want HIGH cache hit ratio to minimize origin costs**

**Questions:**
- [ ] Does Cloudflare count cache hits toward bandwidth limit?
- [ ] Does Cloudflare count origin requests separately?
- [ ] Is there a cost for origin requests from CDN to R2?

---

### 2.4 Cache Settings & TTL

**For our use case:**
- Photos: Cache for 30 days (they stay relevant for 30 days, then deleted)
- Thumbnails: Cache longer (reused across events)
- Processed images: Cache while event is active

**Questions:**
- [ ] Can we set custom TTL per URL pattern?
- [ ] Does TTL setting affect pricing?
- [ ] Is there a cost for cache purge/invalidation API?

---

## 3. Exact Pricing Table (To Be Filled)

### 3.1 Plan Pricing (Current, December 2025)

| Plan | Monthly Cost | Bandwidth Included | Features |
|------|--------------|-------------------|----------|
| **Free** | TBD | TBD (Unmetered?) | TBD |
| **Pro** | TBD | TBD (Unmetered?) | TBD |
| **Business** | TBD | TBD (Unmetered?) | TBD |
| **Enterprise** | Custom | Custom | Custom SLA |

### 3.2 Per-Request/Per-Feature Costs

| Feature | Cost | Unit |
|---------|------|------|
| **Cache purge** | TBD | per purge / free? |
| **Page Rules** | TBD | per rule / free? |
| **Firewall rules** | TBD | per rule / free? |
| **Image Optimization** | TBD | per image / free? |
| **Polish (image compression)** | TBD | per image / free? |

---

## 4. Our Usage Pattern (For Context)

### 4.1 Bandwidth to Participants

| Tier | Participants | Monthly egress |
|------|--------------|-----------------|
| **T1** | 1,000 | ~19 GB |
| **T2** | 15,000 | ~277 GB |
| **T3** | 100,000 | ~1,850 GB |

**This bandwidth is what Cloudflare serves to participants** (the main number for pricing).

### 4.2 Cache Hit Ratio Assumption

**Our assumption (subject to validation):**
- First request to a photo: cache miss, origin fetch from R2
- Subsequent requests (same photo): cache hit, served from edge
- Ratio: ~10-20% cache miss, ~80-90% cache hit

**This means:**
- Egress to participants: 1,850 GB (T3)
- Origin requests to R2: ~185-370 GB worth (10-20% of 1,850)
- But R2 charging is per-request, not per-GB, so impact is ~180K-370K GET requests

---

## 5. Plan Selection: Free vs Pro vs Business

### 5.1 Free Plan Viability

**Question:** Can a bootstrapped startup use Free plan for image delivery?

**Advantages:**
- $0 cost
- 330+ PoPs
- HTTPS, DDoS protection included
- Good for early traction

**Disadvantages (if any):**
- ToS might exclude "high traffic" use cases
- No SLA/guarantees
- Possible rate limiting or throttling
- Customer support may be limited

**Need to verify:**
- [ ] Can Free plan serve 1,850 GB/month egress (Tier 3)?
- [ ] Or does Cloudflare ask to upgrade if you exceed threshold?
- [ ] What is the threshold?

### 5.2 Pro Plan ($20/month)

**If Free plan is too risky:**
- $20/month = ฿639
- Gives "reliable service" / business-grade SLA
- Unmetered bandwidth still

**This is probably the sweet spot for MVP.**

### 5.3 Business Plan ($200/month)

**Probably overkill for MVP:**
- $200/month = ฿6,392
- Mostly adds advanced DDoS, SLA guarantees, priority support
- We don't need yet as bootstrapped startup

---

## 6. Image Optimization Features (Potential Hidden Costs)

### 6.1 Cloudflare Image Resizing

**Feature:** Transform images on-the-fly at edge
- Resize JPEG to smaller versions for mobile
- Compress WebP format
- Crop, rotate, etc.

**Pricing:**
- [ ] Is image resizing free or paid?
- [ ] If paid, cost per image transform?

**Use case for us:**
- Original: 5 MB (full DSLR)
- Web view: 500 KB (smaller)
- Thumbnail: 50 KB
- Could use image resizing instead of pre-processing

**If free:** Great optimization
**If paid:** May not be worth it; pre-process on backend instead

### 6.2 Polish (Automatic Image Optimization)

**Feature:** Cloudflare auto-optimizes images for user's device

**Pricing:**
- [ ] Included in plan or additional charge?

---

## 7. Origin Shield (Advanced)

**Feature:** Extra cache layer between CDN edge and origin (R2)

**What it does:**
- Reduces origin request frequency
- Protects origin from cache stampedes
- Improves cache hit ratio

**Pricing:**
- [ ] Is Origin Shield included in plans?
- [ ] If not, what's the cost?

**Need for us:**
- R2 is serverless and handles scale fine, so probably not needed
- But might be useful to reduce R2 request costs

---

## 8. Cache Behavior & TTL Settings

### 8.1 Default Cache TTL

**Questions:**
- [ ] What is Cloudflare's default cache TTL for media (photos)?
- [ ] Is it 30 days, 1 hour, variable?
- [ ] Do we need Pro plan to customize TTL?
- [ ] Or is TTL customization free?

### 8.2 Cache Key Configuration

**Our need:**
- Cache by URL + event ID
- Ensure different events don't share cached photos

**Questions:**
- [ ] Can we customize cache key?
- [ ] Is this free or Pro-plan feature?

### 8.3 Cache Purge

**Our workflow:**
- When event ends and 30 days pass, photos auto-deleted from R2
- Need to purge from CDN cache too

**Questions:**
- [ ] API cost for purge: Free or charged?
- [ ] Rate limits on purge API?

---

## 9. Comparison: Free vs Pro for Our Use Case

| Factor | Free | Pro |
|--------|------|-----|
| **Cost** | $0 | $20/month (฿639) |
| **Bandwidth** | Unmetered (ToS limits?) | Unmetered |
| **Cache TTL customization** | TBD | TBD |
| **Cache purge API** | TBD | TBD |
| **Support** | Community only | Email support |
| **SLA** | None | TBD |
| **Risk** | May get asked to upgrade | Guaranteed service |

---

## 10. Integration with R2 (The Bundle)

### 10.1 How They Work Together

**Architecture:**
```
Participant (Thailand) → Cloudflare CDN edge (Bangkok PoP)
                        ↓ (cache miss, ~10-20% of requests)
                        Cloudflare R2 origin (same region, no egress fees)
                        ↓
                        S3-compatible storage
```

**No data transfer costs between CDN and R2** (both Cloudflare, same infrastructure)

### 10.2 Origin Shield (Optional Optimization)

**Advanced option:**
```
Participant → CDN edge → Origin Shield (extra cache layer) → R2
```

**Benefits:**
- Reduces cache misses further
- Protects R2 from thundering herd

**Cost:**
- [ ] Included or extra charge?
- [ ] Worth it for MVP?

---

## 11. Alternative CDN Pricing (For Reference)

| CDN | Pricing | Bandwidth | Notes |
|-----|---------|-----------|-------|
| **Cloudflare Free** | $0 | Unmetered (ToS) | Our choice |
| **Cloudflare Pro** | $20/mo | Unmetered | Fallback if needed |
| **AWS CloudFront** | $0.085/GB (APAC) | Per-GB charged | Much more expensive |
| **bunny.net** | $0.03/GB (APAC) | Per-GB charged | Cheaper than AWS, still expensive |
| **Fastly** | $0.19/GB (APAC) | Per-GB charged | Expensive |
| **Akamai** | Custom | Enterprise | Enterprise only |

**Cloudflare is by far the cheapest for us** (Free plan if possible, Pro as backup).

---

## 12. Fine Print / Terms of Service Issues

### 12.1 "Unmetered Bandwidth" Caveat

**Cloudflare's ToS says:**
- Free/Pro plans have "unmetered bandwidth"
- **BUT** subject to "acceptable use policy"

**Need to check:**
- [ ] What is acceptable use threshold?
- [ ] Is 1,850 GB/month considered "fair use"?
- [ ] Have other services been throttled/blocked for high usage?

### 12.2 Caching Policies

**Cloudflare may not cache:**
- Dynamic content (personalized)
- Frequently changing files
- Files with short TTL

**For us (static photos):**
- Should cache perfectly fine
- No issues expected

### 12.3 Origin Requirement

**Cloudflare CDN requires:**
- Origin server must be reachable from Cloudflare edge
- Must handle CORS preflight requests
- Must support range requests (for video/streaming)

**R2 supports all of this,** so no issues.

---

## 13. Cost Calculation Framework (To Be Filled Later)

**Once we confirm plan costs and bandwidth assumptions:**

```
Monthly CDN Cost =
  + Plan cost (Free: $0, Pro: $20)
  + Bandwidth egress (Free/Pro: $0 assuming within ToS)
  + Origin Shield (if used)
  + Image optimization features (if paid)
```

**For each tier:**

| Tier | Plan | Bandwidth | **Total** |
|------|------|-----------|-----------|
| **T1** | Free or Pro? | $0 | **$0 or $20** |
| **T2** | Free or Pro? | $0 | **$0 or $20** |
| **T3** | Free or Pro? | $0 | **$0 or $20** |

---

## 14. Questions to Answer via Official Sources

### 14.1 Plan Pricing & Features
- [ ] Exact current pricing for Free/Pro/Business?
- [ ] What features are included in each?
- [ ] What's the difference between Pro and Business?

### 14.2 Bandwidth & Fair Use
- [ ] Confirm "unmetered bandwidth" means no per-GB charge?
- [ ] What is the acceptable use threshold?
- [ ] Can we serve 1.85 TB/month on Free plan?
- [ ] If not, what's the threshold before upgrade needed?

### 14.3 Cache & TTL
- [ ] Can we customize cache TTL on Free plan?
- [ ] Default TTL for images/photos?
- [ ] Is cache purge API free?

### 14.4 Integration with R2
- [ ] Are there any data transfer fees between CDN and R2?
- [ ] Is Origin Shield recommended for R2 origins?
- [ ] Does Origin Shield have additional cost?

### 14.5 Image Features
- [ ] Is Image Resizing included or paid?
- [ ] Is Polish (auto-optimization) included or paid?

---

## 15. Official Sources to Check

**Primary:**
- https://www.cloudflare.com/plans/ ← **CHECK CURRENT PRICING**
- https://developers.cloudflare.com/cache/ ← **CACHE SETTINGS**
- https://developers.cloudflare.com/images/cdn/ ← **IMAGE FEATURES**
- https://www.cloudflare.com/terms/ ← **ACCEPTABLE USE POLICY**

**Secondary:**
- Cloudflare dashboard pricing calculator
- Cloudflare community forums (users discussing bandwidth limits)
- Recent blog posts about CDN updates

---

## 16. Resolution (To Be Filled)

### Exact Cloudflare CDN Pricing Discovered:

**Plan Costs:**
- Free: **TBD**
- Pro: **TBD USD/month**
- Business: **TBD USD/month**

**Bandwidth:**
- Free plan: **TBD** (unmetered or limit?)
- Pro plan: **TBD** (unmetered or limit?)
- Per-GB cost: **$0 or TBD?**

**Cache Features:**
- TTL customization: **Free or paid?**
- Cache purge API: **Free or paid?**
- Default TTL: **TBD**

**Image Features:**
- Image Resizing: **Included or TBD cost?**
- Polish: **Included or TBD cost?**

**Origin Shield:**
- Available: **Yes/No**
- Cost: **TBD**

**Fair Use Threshold:**
- Max bandwidth before upgrade: **TBD GB/month**
- Acceptable use policy: **Allows 1,850 GB/month? TBD**

---

## 17. Next Steps

1. **Check official Cloudflare pricing page** (plans/pricing)
2. **Check Cloudflare Cache documentation**
3. **Check acceptable use policy / ToS**
4. **Test: Can we get exact per-feature costs?**
5. **Document findings in Resolution section**
6. **Calculate monthly cost for Tier 1/2/3 once confirmed**
7. **Make final decision: Free vs Pro plan for MVP**

---

**Last updated:** 2025-12-01
**Status:** Awaiting pricing verification
