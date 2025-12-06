# Research Log: Cloudflare R2 Pricing Model - Exact Specification

**Status:** IN PROGRESS - PRICING RESEARCH ONLY
**Date Created:** 2025-12-01
**Context:** Decision to use Cloudflare R2 for object storage (original photos, processed photos, thumbnails)
**Goal:** Document EXACT pricing model for R2 so we can calculate accurate monthly costs later

---

## 1. What is Cloudflare R2?

**R2 = Replicated object storage** (Amazon S3 compatible API)

**Key marketing claim:** "Zero egress fees" - this is the main reason to choose R2 over AWS S3

---

## 2. R2 Pricing Components

### 2.1 Storage Pricing

**Source:** https://developers.cloudflare.com/r2/pricing/

**Tier 1: Free tier (never expires, always available)**
- [ ] Free storage capacity per month: **? GB**
- [ ] Free requests per month: **? requests**

**After free tier:**
- [ ] Storage cost: **? USD per GB per month**
- [ ] Effective cost at Tier 1 storage (28 GB): **?**
- [ ] Effective cost at Tier 2 storage (278 GB): **?**
- [ ] Effective cost at Tier 3 storage (2,200 GB): **?**

**Notes to verify:**
- [ ] Does pricing include deleted/expired objects (30-day retention)?
- [ ] Is storage charged for peak usage or average?
- [ ] Are different storage classes (standard vs infrequent) available?

---

### 2.2 Request Pricing

**PUT/POST/DELETE requests (write):**
- [ ] Free tier: **? requests per month**
- [ ] After free tier: **? USD per million requests**
- [ ] Cost at Tier 1 uploads (5,000 photos): **?**
- [ ] Cost at Tier 2 uploads (50,000 photos): **?**
- [ ] Cost at Tier 3 uploads (400,000 photos): **?**

**GET requests (read/download):**
- [ ] Free tier: **? requests per month**
- [ ] After free tier: **? USD per million requests**
- [ ] Cost at Tier 1 downloads: **?**
- [ ] Cost at Tier 2 downloads: **?**
- [ ] Cost at Tier 3 downloads: **?**

**Notes to verify:**
- [ ] LIST requests - are they charged separately or included in GET?
- [ ] HEAD requests - are they charged?
- [ ] Does CDN caching (see Cloudflare CDN section) reduce GET request counts?

---

### 2.3 Egress Pricing

**THE BIG PROMISE: "Zero egress fees"**

**Exact specification needed:**
- [ ] Egress to internet: **FREE or $X?**
- [ ] Egress to Cloudflare CDN: **FREE or $X?**
- [ ] Egress to AWS regions: **FREE or $X?**
- [ ] Egress to other cloud providers: **FREE or $X?**
- [ ] Data transfer between R2 buckets: **FREE or $X?**

**From research:**
- R2 marketing says "no egress fees" but need to verify exact scope

**Cost implications:**
- If true zero egress: **HUGE savings** vs AWS S3 ($0.09-0.12/GB)
- Our Tier 3 egress: 1,850 GB/month
- AWS cost: 1,850 × $0.09 = $166.50/month
- R2 cost: $0 (if truly zero)
- **Savings: $166.50/month** (฿5,322)

---

### 2.4 Additional/Hidden Costs

**Possible charges to investigate:**
- [ ] API calls for authentication/tokens: **Charged or free?**
- [ ] CloudFront origin requests (if using CDN): **Any charge from R2 side?**
- [ ] Bucket management/admin operations: **Charged or free?**
- [ ] Cross-region replication: **Cost per GB?**
- [ ] Lifecycle policies (auto-delete after 30 days): **Any cost?**
- [ ] CORS preflight requests: **Charged as GET request?**

---

## 3. Exact Pricing Table (To Be Filled)

### 3.1 Current R2 Pricing (as of December 2025)

| Component | Pricing | Unit |
|-----------|---------|------|
| **Free Tier Storage** | TBD | GB/month |
| **Paid Storage** | TBD | USD/GB/month |
| **Free Tier Requests** | TBD | requests/month |
| **PUT/POST/DELETE** | TBD | USD per 1M requests |
| **GET requests** | TBD | USD per 1M requests |
| **LIST operations** | TBD | USD per 1M requests |
| **Egress (Internet)** | TBD | USD/GB |
| **Egress (CDN)** | TBD | USD/GB |
| **Egress (Cross-region)** | TBD | USD/GB |

---

## 4. Our Usage Patterns (For Context)

### 4.1 Storage Usage

| Phase | Photos | Sizes | Total Storage |
|-------|--------|-------|-----------------|
| **Original uploads** | 5K / 50K / 400K | 5 MB each | 25 GB / 250 GB / 2,000 GB |
| **Processed versions** | 5K / 50K / 400K | 0.5 MB each | 2.5 GB / 25 GB / 200 GB |
| **Thumbnails** | 5K / 50K / 400K | 0.05 MB each | 0.25 GB / 2.5 GB / 20 GB |
| **Total per tier** | - | - | **~28 GB / ~278 GB / ~2,200 GB** |

**Retention:** 30 days (then auto-delete)

### 4.2 Request Patterns

**Write operations (uploads):**
- Tier 1: 5,000 photos → 5,000 PUT requests
- Tier 2: 50,000 photos → 50,000 PUT requests
- Tier 3: 400,000 photos → 400,000 PUT requests

**Read operations (downloads + viewing):**
- Tier 1: ~19 GB egress ÷ 0.5 MB avg file = ~38,000 GET requests
- Tier 2: ~277 GB egress ÷ 0.5 MB avg file = ~554,000 GET requests
- Tier 3: ~1,850 GB egress ÷ 0.5 MB avg file = ~3,700,000 GET requests

**Note:** If using Cloudflare CDN (see next doc), CDN caches responses and reduces backend GET requests dramatically.

---

## 5. Known Facts from Previous Research

From `02_object_storage_result.md`:
- AWS S3 (APAC): **$2.41 / $31.88 / $221.50** per tier (storage + egress)
- **Cloudflare R2:** **$0.42 / $4.17 / $33.00** per tier
- **Difference:** R2 is ~94% cheaper than S3

**But we need to verify:**
- [ ] Is the $0.42/$4.17/$33.00 figure ACTUAL pricing or estimate?
- [ ] Does it include all components (storage + requests)?
- [ ] What assumptions were made in that calculation?

---

## 6. Questions to Answer via Official Pricing Page

### 6.1 Storage Questions
- [ ] What is the **exact current price per GB** for storage after free tier?
- [ ] Is storage calculated as peak usage (highest point in month) or average?
- [ ] Is 30-day retention charged for all files or just active files?
- [ ] Are deleted files still charged until purged?

### 6.2 Request Questions
- [ ] **Exact price per 1M requests** for PUT/POST/DELETE?
- [ ] **Exact price per 1M requests** for GET?
- [ ] Are these prices the same globally or region-specific?
- [ ] Do batch operations (bulk delete, copy) have different pricing?

### 6.3 Egress Questions
- [ ] **Confirm: Zero egress to internet = $0/GB?**
- [ ] **Confirm: Zero egress to Cloudflare CDN = $0/GB?**
- [ ] What about egress to AWS regions or other clouds?
- [ ] Is there any "data transfer" fee between R2 and Cloudflare CDN?

### 6.4 Free Tier Questions
- [ ] Does free tier renew monthly or is it a one-time grant?
- [ ] What happens if you exceed free tier in mid-month? (does overage bill immediately or end of month?)
- [ ] Can free tier be used indefinitely or is it time-limited?

---

## 7. Implementation Details to Verify

### 7.1 Lifecycle Policies
**Our use case:** Auto-delete photos after 30 days

- [ ] Cost to create/manage lifecycle rules: **Free or charged?**
- [ ] Cost per deletion triggered by lifecycle: **Counted as DELETE request and charged?**
- [ ] Estimate: 5K-400K photos deleted per month = additional request costs?

**Example Tier 3:**
- 400K photos + lifecycle deletes = ~800K total write+delete operations
- If charged: 800K ÷ 1M × $0.10 (assumed) = **$0.08 additional cost**

### 7.2 API Compatibility (AWS S3)
- [ ] S3-compatible API means same pricing model as S3?
- [ ] Or does Cloudflare use simplified pricing?
- [ ] Any operations that are free on S3 but paid on R2?

---

## 8. Comparison with Competitors

For context (we're not using these, but for reference):

| Provider | Storage | Egress | Notes |
|----------|---------|--------|-------|
| **AWS S3** | $0.023-0.025/GB | $0.09/GB | Standard reference |
| **Google Cloud Storage** | ~$0.020/GB | ~$0.12/GB | Regional buckets |
| **Azure Blob** | ~$0.015-0.018/GB | ~$0.08/GB | Hot/Cool tiers |
| **Backblaze B2** | $0.006/GB | $0.01/GB | Cheap storage + egress |
| **Wasabi** | $0.0039/GB | FREE | No egress fees (like R2) |
| **DigitalOcean Spaces** | $5/month (250GB) | $0.01/GB overage | Flat-rate storage |
| **Cloudflare R2** | ? | FREE | Need to verify storage cost |

---

## 9. R2 with Cloudflare CDN (Integration)

**How they work together:**

1. Original file → R2 storage
2. Cloudflare CDN caches processed/thumbnail versions at edge
3. Subsequent requests served from CDN cache (zero R2 requests)
4. Only first request hits R2

**Pricing interaction:**
- [ ] Does CDN integration reduce R2 GET request costs?
- [ ] Are CDN cache hits counted as R2 GET requests?
- [ ] If using CDN, what percentage of traffic comes from cache vs origin?

**Assumption:** With CDN, 80-90% of reads from cache, 10-20% from R2 origin.

---

## 10. Cost Calculation Framework (To Be Filled Later)

**Once we have exact pricing, monthly cost will be:**

```
R2 Monthly Cost =
  + Storage cost (based on peak GB used)
  + Write requests cost (uploads)
  + Read requests cost (downloads)
  + Egress cost (should be $0)
  - Free tier allowances
```

**For each tier:**

| Tier | Storage | Writes | Reads | Egress | **Total** |
|------|---------|--------|-------|--------|-----------|
| **T1** | TBD | TBD | TBD | $0 | **TBD** |
| **T2** | TBD | TBD | TBD | $0 | **TBD** |
| **T3** | TBD | TBD | TBD | $0 | **TBD** |

---

## 11. Risk Factors & Edge Cases

### 11.1 Egress "Zero Fees" Caveat
- [ ] Does "zero egress" really mean all egress is free?
- [ ] Or are there limits/caps on free egress?
- [ ] What if you're a power user (10+ TB/month egress)?
- [ ] Is there an acceptable use policy that could change this?

### 11.2 Pricing Changes
- [ ] Has R2 pricing changed since launch (2022)?
- [ ] Are price changes announced in advance?
- [ ] Should we plan for price increases?

### 11.3 Free Tier Limits
- [ ] If free tier isn't enough for Tier 1, will costs be surprising?
- [ ] Example: If free tier is 10GB storage, Tier 1 storage = 28GB means 18GB × $X paid

---

## 12. Official Sources to Check

**Primary:**
- https://developers.cloudflare.com/r2/pricing/ ← **START HERE**
- https://developers.cloudflare.com/r2/platform/billing/
- https://developers.cloudflare.com/r2/get-started/

**Secondary:**
- Cloudflare dashboard (pricing estimates when creating bucket)
- Cloudflare community forums (users discussing costs)
- Recent blog posts about R2 pricing updates

---

## 13. Resolution (To Be Filled)

### Exact R2 Pricing Discovered:

**Storage:**
- Free tier: **TBD**
- Paid tier: **TBD USD/GB/month**

**Requests:**
- Free tier: **TBD requests/month**
- PUT/POST/DELETE: **TBD USD per 1M**
- GET: **TBD USD per 1M**
- LIST/HEAD: **TBD USD per 1M**

**Egress:**
- Internet: **TBD**
- CDN: **TBD**
- Cross-region: **TBD**

**Free tier duration:**
- Renews: **Monthly / One-time / Unlimited**
- Expiration: **TBD**

**Lifecycle operations cost:**
- Auto-delete after 30 days: **Counted as DELETE requests? TBD**

---

## 14. Next Steps

1. **Verify pricing on official Cloudflare page**
2. **Document exact numbers in "Resolution" section above**
3. **Cross-reference with previous research to validate $0.42/$4.17/$33 estimates**
4. **Calculate exact monthly costs for Tier 1/2/3 once pricing is confirmed**
5. **Compare with R2+CDN bundle vs R2 alone**

---

**Last updated:** 2025-12-01
**Status:** Awaiting pricing verification
