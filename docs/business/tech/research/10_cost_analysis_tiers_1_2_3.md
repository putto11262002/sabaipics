# Cost Analysis: Monthly Costs for Tier 1, 2, 3

**Status:** COST ESTIMATION (rough calculations)
**Date:** 2025-12-01
**Exchange Rate:** 1 USD = 31.96 THB
**Assumptions:** From project documentation

---

## Usage Assumptions by Tier

| Metric | Tier 1 | Tier 2 | Tier 3 |
|--------|--------|--------|--------|
| **Participants per event** | 1,000 | 15,000 | 100,000 |
| **Monthly events** | 10 | 50 | 200 |
| **Photos per event** | 500 | 500 | 500 |
| **Total photos/month** | 5,000 | 25,000 | 100,000 |
| **Photo size (avg)** | 5 MB | 5 MB | 5 MB |
| **Storage (originals)** | 25 GB | 125 GB | 500 GB |
| **Photo downloads/month** | 19 GB | 277 GB | 1,850 GB |
| **Processed versions** | 2.5 GB | 12.5 GB | 50 GB |
| **Thumbnails** | 0.25 GB | 1.25 GB | 5 GB |
| **Total storage** | ~28 GB | ~140 GB | ~560 GB |

---

## Cost Breakdown by Service

### 1. AWS Rekognition (Face AI)

**Usage:**
- Tier 1: 5,000 photos/month
- Tier 2: 25,000 photos/month
- Tier 3: 100,000 photos/month

**Operations per photo:**
1. IndexFaces (store face vectors) = 1 image
2. SearchFacesByImage (match participant selfies) = 1 image per participant per event
   - Tier 1: 1,000 participants × 10 events = 10,000 searches
   - Tier 2: 15,000 participants × 50 events = 750,000 searches
   - Tier 3: 100,000 participants × 200 events = 20,000,000 searches

**Total images processed:**
- Tier 1: 5,000 (indexing) + 10,000 (searching) = 15,000 images/month
- Tier 2: 25,000 (indexing) + 750,000 (searching) = 775,000 images/month
- Tier 3: 100,000 (indexing) + 20,000,000 (searching) = 20,100,000 images/month

**Pricing (first 1M images = $0.001/image):**

| Tier | Images | Cost per Image | Subtotal | Free Tier (1K) | **Monthly Cost** |
|------|--------|-----------------|----------|----------------|------------------|
| **T1** | 15,000 | $0.001 | $15 | -$1 | **$14** (฿447) |
| **T2** | 775,000 | $0.001 | $775 | -$1 | **$774** (฿24,722) |
| **T3** | 20,100,000 | Tiered pricing | See below | -$1 | **~$16,500** (฿527,300) |

**Tier 3 Detail (volume discounts):**
- First 1M: 1,000,000 × $0.001 = $1,000
- Next 4M (1M-5M): 4,000,000 × $0.0008 = $3,200
- Next 15M (5M-20M): 15,000,000 × $0.0006 = $9,000
- **Subtotal:** $13,200
- **Free tier:** -$1
- **Total:** **$13,199**

**Face storage:** Negligible (~$0.05/month across all tiers)

---

### 2. Cloudflare R2 (Object Storage)

**Storage (Standard Storage at $0.015/GB-month):**

| Tier | Total GB | Storage Cost | Free Tier (10GB) | **Monthly Cost** |
|------|----------|--------------|------------------|------------------|
| **T1** | 28 GB | $0.42 | -$0.15 | **$0.27** (฿8.60) |
| **T2** | 140 GB | $2.10 | -$0.15 | **$1.95** (฿62) |
| **T3** | 560 GB | $8.40 | -$0.15 | **$8.25** (฿264) |

**Class A Operations (PUT = upload photos):**
- Tier 1: 5,000 photos × 3 versions (original + web + thumbnail) = 15,000 PUTs
- Tier 2: 25,000 photos × 3 = 75,000 PUTs
- Tier 3: 100,000 photos × 3 = 300,000 PUTs

Cost: $4.50 per 1M requests, free tier 1M/month

| Tier | PUTs | Cost | Free Tier | **Monthly Cost** |
|------|------|------|-----------|------------------|
| **T1** | 15,000 | ~$0 | Free | **$0** |
| **T2** | 75,000 | ~$0 | Free | **$0** |
| **T3** | 300,000 | ~$0 | Free | **$0** |

**Class B Operations (GET = download photos):**
- CDN caching reduces R2 requests by 80-90%
- Estimate: 10-20% of downloads hit R2 origin
- Tier 1: 19 GB ÷ 0.5 MB = 38,000 GETs × 15% = 5,700 GETs
- Tier 2: 277 GB ÷ 0.5 MB = 554,000 GETs × 15% = 83,100 GETs
- Tier 3: 1,850 GB ÷ 0.5 MB = 3,700,000 GETs × 15% = 555,000 GETs

Cost: $0.36 per 1M requests, free tier 10M/month

| Tier | GETs | Cost | Free Tier | **Monthly Cost** |
|------|------|------|-----------|------------------|
| **T1** | 5,700 | ~$0 | Free | **$0** |
| **T2** | 83,100 | ~$0 | Free | **$0** |
| **T3** | 555,000 | ~$0.20 | Free | **$0.20** (฿6.40) |

**Egress: FREE (unlimited)**

**R2 Total:**

| Tier | Storage | Operations | Egress | **Monthly Total** |
|------|---------|------------|--------|-------------------|
| **T1** | $0.27 | $0 | $0 | **$0.27** (฿8.60) |
| **T2** | $1.95 | $0 | $0 | **$1.95** (฿62) |
| **T3** | $8.25 | $0.20 | $0 | **$8.45** (฿270) |

---

### 3. Cloudflare CDN (Content Delivery)

**Free Plan** - UNLIMITED bandwidth, ZERO cost

| Tier | Bandwidth | Cost |
|------|-----------|------|
| **T1** | 19 GB | **$0** |
| **T2** | 277 GB | **$0** |
| **T3** | 1,850 GB | **$0** |

---

### 4. Cloudflare Workers + Durable Objects (API Backend + WebSocket)

**Free Tier includes:**
- 100,000 requests/day = 3M requests/month
- 13,000 GB-sec/day = 390K GB-sec/month

**Usage estimates:**
- API searches: Tier 1 (10,000/month), Tier 2 (750,000/month), Tier 3 (20M/month)
- WebSocket: Photographers online during events only

**Tier 1 & 2: Stay within FREE tier**

| Tier | Requests | Cost |
|------|----------|------|
| **T1** | 10,000 | **$0** (within 3M free) |
| **T2** | 750,000 | **$0** (within 3M free) |
| **T3** | 20,000,000 | Need PAID plan |

**Tier 3 calculation:**
- Free tier: 10M requests × $0 = $0
- Paid tier minimum: $5/month (includes 10M more)
- Overage: 20M - 10M (free) - 10M (paid) = 0 overage
- **Cost: $5/month**

| Tier | Monthly Cost | Thai |
|------|--------------|------|
| **T1** | **$0** | **฿0** |
| **T2** | **$0** | **฿0** |
| **T3** | **$5** | **฿160** |

---

### 5. Cloudflare Pages (Participant Web App)

**Free Plan** - UNLIMITED bandwidth, ZERO cost

| Tier | Cost |
|------|------|
| **T1** | **$0** |
| **T2** | **$0** |
| **T3** | **$0** |

---

### 6. Neon Postgres (Database)

**Free tier:** 100 CU-hours/month = sufficient for MVP

**Usage estimate:** ~10-50 CU-hours/month (metadata queries, not heavy computation)

| Tier | Estimated Usage | Plan | Cost |
|------|-----------------|------|------|
| **T1** | 20 CU-hours | Free | **$0** |
| **T2** | 30 CU-hours | Free | **$0** |
| **T3** | 50 CU-hours | Free tier OK or Launch $5 | **$0-5** |

**Assumption:** Stays in free tier for all

| Tier | Monthly Cost |
|------|--------------|
| **T1** | **$0** |
| **T2** | **$0** |
| **T3** | **$0** |

---

### 7. FTP Server (Self-Hosted VPS)

**Selected:** DigitalOcean Droplet (Singapore region)

**Tier 1:** Nano ($4/month) - 500 GB free bandwidth
- Egress: 180 GB/month (within free)
- **Cost: $4/month**

**Tier 2:** Micro ($6/month) - 1 TB free bandwidth
- Egress: 900 GB/month (within free)
- **Cost: $6/month**

**Tier 3:** Small ($12/month) - 2 TB free bandwidth
- Egress: 3,600 GB/month (exceeds 2 TB by 1,600 GB)
- Overage: 1,600 GB × $0.01 = $16
- **Cost: $12 + $16 = $28/month**

| Tier | Base Cost | Overage | **Total** |
|------|-----------|---------|-----------|
| **T1** | $4 | $0 | **$4** (฿128) |
| **T2** | $6 | $0 | **$6** (฿192) |
| **T3** | $12 | $16 | **$28** (฿895) |

---

### 8. LINE Official Account (Messaging)

**Free Plan:** 300 messages/month

**Usage estimate:**
- Tier 1: 10 events × 100 participants = 1,000 messages (exceeds free tier)
- Tier 2: 50 events × 1,000 participants = 50,000 messages (need paid plan)
- Tier 3: 200 events × 10,000 participants = 2,000,000 messages (need PRO plan)

**Recommendation:**

| Tier | Monthly Messages | Plan | Cost (THB) | Cost (USD) | Thai |
|------|-----------------|------|------------|------------|------|
| **T1** | 1,000 | Free | ฿0 | $0 | **฿0** |
| **T2** | 50,000 | Basic (15K included) | ฿1,370 | $42.88 | **฿1,370** |
| **T3** | 2,000,000 | Pro (35K included) | ฿1,905 | $59.66 | **฿1,905** |

*Note: Tier 2 will need overage charges (~฿0.10 per message × 35K excess) = ~฿3,500/month*
*Tier 3 volume too high; might need enterprise plan (TBD)*

---

### 9. Next.js / Vercel (Public Website)

**Pro Plan:** $20/month

| Tier | Cost |
|------|------|
| **T1** | **$20** (฿639) |
| **T2** | **$20** (฿639) |
| **T3** | **$20** (฿639) |

---

## TOTAL MONTHLY COSTS BY TIER

### Tier 1 (1,000 participants)

| Service | Cost (USD) | Cost (THB) |
|---------|-----------|-----------|
| AWS Rekognition | $14 | ฿447 |
| Cloudflare R2 | $0.27 | ฿8.60 |
| Cloudflare CDN | $0 | ฿0 |
| Cloudflare Workers | $0 | ฿0 |
| Cloudflare Pages | $0 | ฿0 |
| Neon Postgres | $0 | ฿0 |
| FTP VPS | $4 | ฿128 |
| LINE OA | $0 | ฿0 |
| Vercel | $20 | ฿639 |
| **TOTAL** | **$38.27** | **฿1,223** |

---

### Tier 2 (15,000 participants)

| Service | Cost (USD) | Cost (THB) |
|---------|-----------|-----------|
| AWS Rekognition | $774 | ฿24,722 |
| Cloudflare R2 | $1.95 | ฿62 |
| Cloudflare CDN | $0 | ฿0 |
| Cloudflare Workers | $0 | ฿0 |
| Cloudflare Pages | $0 | ฿0 |
| Neon Postgres | $0 | ฿0 |
| FTP VPS | $6 | ฿192 |
| LINE OA Basic + Overage | $42.88 + $1,100* | ฿1,370 + ฿35,000* |
| Vercel | $20 | ฿639 |
| **TOTAL** | **$1,844.83** | **฿61,985** |

*Rough estimate for message overage (35K extra messages × ฿0.10)*

---

### Tier 3 (100,000 participants)

| Service | Cost (USD) | Cost (THB) |
|---------|-----------|-----------|
| AWS Rekognition | $13,199 | ฿421,783 |
| Cloudflare R2 | $8.25 | ฿264 |
| Cloudflare CDN | $0 | ฿0 |
| Cloudflare Workers | $5 | ฿160 |
| Cloudflare Pages | $0 | ฿0 |
| Neon Postgres | $0 | ฿0 |
| FTP VPS | $28 | ฿895 |
| LINE OA | TBD (Enterprise) | ฿TBD |
| Vercel | $20 | ฿639 |
| **TOTAL** | **~$13,260** | **~฿423,741** |

*Note: LINE pricing for 2M messages/month needs enterprise negotiation*

---

## Cost Per Participant / Per Event

### Cost per Participant

| Tier | Monthly Cost | Participants | **Cost per Participant** |
|------|--------------|--------------|-------------------------|
| **T1** | $38.27 | 1,000 | **$0.038** |
| **T2** | $1,844.83 | 15,000 | **$0.123** |
| **T3** | $13,260 | 100,000 | **$0.133** |

### Cost per Event

| Tier | Monthly Cost | Events/month | **Cost per Event** |
|------|--------------|--------------|-------------------|
| **T1** | $38.27 | 10 | **$3.83** |
| **T2** | $1,844.83 | 50 | **$36.90** |
| **T3** | $13,260 | 200 | **$66.30** |

### Cost per Photo

| Tier | Monthly Cost | Photos/month | **Cost per Photo** |
|------|--------------|--------------|-------------------|
| **T1** | $38.27 | 5,000 | **$0.0077** |
| **T2** | $1,844.83 | 25,000 | **$0.0738** |
| **T3** | $13,260 | 100,000 | **$0.1326** |

---

## Key Insights

1. **Tier 1 is CHEAP:** $38/month all-in. AWS Rekognition dominates cost (~$14).

2. **Tier 2 scales with complexity:** $1,845/month. AWS Rekognition jumps to $774 (search operations).

3. **Tier 3 is expensive:** $13,260/month. AWS Rekognition face search = $13,199 (99.5% of cost!).

4. **Zero Egress Strategy Worked:**
   - R2: $0 egress (saves ~$150/month at Tier 3)
   - CDN: $0 bandwidth (saves ~$900/month at Tier 3)
   - **Total savings: ~$1,050/month vs AWS S3 + CloudFront**

5. **Cloudflare Bundle Optimization:**
   - Workers + Durable Objects: $5 (Tier 3 only)
   - Pages: $0 (unlimited bandwidth)
   - R2: $8 (Tier 3, with free egress)
   - CDN: $0 (unlimited bandwidth)
   - **Total Cloudflare infrastructure: ~$13 (Tier 3)**

6. **AWS Rekognition is the cost driver:**
   - Tier 1: $14
   - Tier 2: $774 (55x more!)
   - Tier 3: $13,199 (942x more!)
   - **Need to validate if search operations can be optimized or cached**

7. **Line Messaging at scale:** Becomes expensive beyond 35K messages/month. May need enterprise pricing for Tier 3.

---

## Pricing Validation Needed

- [ ] **AWS Rekognition:** Can we cache/batch search operations to reduce costs?
- [ ] **LINE Messaging:** Enterprise pricing for 2M messages/month?
- [ ] **Neon Postgres:** Will 50 CU-hours be enough for Tier 3, or do we need Launch plan?
- [ ] **VPS Egress:** Verify Tier 3 egress costs with DigitalOcean (may differ from estimate)

---

**Last updated:** 2025-12-01
**Ready for:** Phase 3b pricing strategy + product positioning
