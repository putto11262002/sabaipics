# Revised Unit Economics: Realistic LINE Messaging

**Status:** Corrected cost assumptions - LINE only for photos actually sent

**Date:** 2025-12-01

**Key Correction:** LINE messaging is HIGH cost - should only apply to photos actually delivered, not all uploaded

---

## The Correction

### Old Assumption (Wrong)
- 10,000 photos uploaded
- 50% sent via LINE = 5,000 photos
- LINE cost applies to every photo that exists
- **Result:** $42.88/month LINE cost included in per-photo base

### New Assumption (Realistic)
- 10,000 photos uploaded
- Only photos that are **actually found by searches and sent to participants** trigger LINE cost
- Not all photos are found (some uploaded but never downloaded)
- Only photos actually **delivered to users** via LINE cost money
- **Result:** Much lower LINE cost per photo

---

## Realistic Scenario: Photo Delivery Rate

### Upload vs Delivery Flow

```
10,000 photos uploaded
    ↓
7,000 searches happen (70% participation)
    ↓
~2,000-3,000 photos actually found & downloaded
    (Only ~20-30% of uploaded photos are ever retrieved)
    ↓
~50% of those get sent via LINE = 1,000-1,500 photos
    (Rest just downloaded from web, no LINE cost)
    ↓
LINE cost applies ONLY to 1,000-1,500 photos sent
```

### More Realistic Cost Breakdown

| Metric | Value |
|--------|-------|
| Photos uploaded | 10,000 |
| Actually found in searches | 2,000-3,000 (20-30%) |
| Downloaded from web (no LINE) | 1,000-1,500 (10-15%) |
| Sent via LINE to users | 500-1,500 (5-15%) |

---

## Recalculated Cost Structure (Per Photo)

### Base Infrastructure (Only for Uploaded Photos)

| Component | Cost/Month | Per-Photo Cost | Notes |
|-----------|-----------|----------------|-------|
| AWS Rekognition | $16.10 | $0.00161 | All 10K photos indexed + searched |
| Cloudflare R2 | $0.60 | $0.00006 | All 10K photos stored |
| FTP Server | $4.00 | $0.0004 | All 10K photos uploaded |
| **Subtotal (Infra)** | **$20.70** | **$0.00207** | Core cost per uploaded photo |

### LINE Messaging (Only for Photos Actually Sent)

**Scenario: 1,000 photos actually sent via LINE**
- LINE Basic plan: $42.88/month
- Allocated to 1,000 sent photos: $42.88 ÷ 1,000 = **$0.04288 per photo sent**

**But this is a shared cost across all uploaded photos:**
- 1,000 photos sent out of 10,000 uploaded
- LINE cost per uploaded photo: $42.88 ÷ 10,000 = **$0.00429 per photo**
- LINE cost per actually-sent photo: $42.88 ÷ 1,000 = **$0.04288 per photo sent**

### Total Cost Per Photo (Two Views)

**View 1: Cost per uploaded photo (all 10K)**
| Item | Cost |
|------|------|
| AWS + R2 + FTP | $0.00207 |
| LINE (allocated to all) | $0.00429 |
| Overhead (30-40%) | $0.002-0.003 |
| **Total** | **$0.006-0.008** |

**View 2: Cost per photo actually sent**
| Item | Cost |
|------|------|
| AWS + R2 + FTP | $0.00207 |
| LINE (full cost) | $0.04288 |
| Overhead (5% for send) | $0.002 |
| **Total** | **$0.047** |

---

## Which Cost Model Makes Sense?

### For Pricing Photographers:

**Option A: Charge per uploaded photo**
- Photographer uploads 100 photos
- You charge for 100 photos
- Doesn't matter if all 100 are found/sent
- **This is what you proposed** ✅

**Then LINE cost is:**
- Allocated across all uploaded photos
- Not a separate line item
- **Cost per uploaded photo: $0.006-0.008**

### For Calculating Profit:

You need to know:
1. **What percentage of photos actually get sent via LINE?** (5-15%?)
2. **Do you charge a flat per-photo rate?** (Yes)
3. **Does LINE cost vary with actual sends?** (Yes, but unpredictable)

**This means:**
- Some months LINE cost is low (few photos sent)
- Some months LINE cost is high (many photos sent)
- Average out over time = $42.88/month baseline

---

## Three Pricing Models

### Model 1: All-Inclusive (Simple)

**Charge:** $0.03/photo (all-inclusive)

**Covers:**
- AWS Rekognition, R2, FTP (mandatory)
- LINE messaging (averaged across all photos)

**Cost per photo:**
- Upload: $0.00207
- LINE (1 out of 10): $0.00429
- Overhead: $0.002
- **Total: $0.008**

**Margin:** $0.03 - $0.008 = **$0.022 (73% margin)**

**Downside:** Some photos never get sent via LINE, but you're paying the cost. You're subsidizing low-usage customers.

---

### Model 2: Tiered by Usage (Complex)

**Charge per tier based on expected LINE usage:**

| Tier | Photos/Month | Expected Sends | LINE Included | Price | Cost | Margin |
|------|--------------|-----------------|---------------|-------|------|--------|
| Basic | 1,000 | 100 | Yes | $25 | $0.025/photo | $0.025-0.008=$0.017 |
| Pro | 5,000 | 500 | Yes | $100 | $0.02/photo | $0.02-0.008=$0.012 |
| Studio | 10,000+ | 1,000+ | Yes | $200 | $0.02/photo | $0.02-0.008=$0.012 |

**Downside:** More complex, harder to explain to customers.

---

### Model 3: Charge Only for Sends (Most Accurate)

**Charge:**
- $0.003/photo for upload (AWS + R2 + FTP)
- $0.04/photo sent via LINE (actual LINE cost + margin)

**Photographer sees:**
- "Free upload for all photos"
- "Pay $0.04 only when photos are sent to participants via LINE"

**Downside:** Unpredictable costs for photographers, confusing pricing.

---

## Recommendation: Use Model 1 (All-Inclusive)

**Why:**
1. **Simple** - customers understand one number
2. **Predictable** - photographer knows exact cost
3. **Fair** - most customers won't send 100% of photos anyway
4. **Healthy margin** - still 60-70% even with LINE included

**Pricing:**

| Tier | Price | Cost | Margin |
|------|-------|------|--------|
| Pay-as-you-go | $0.04 | $0.008 | **80%** |
| Starter | $0.03 | $0.008 | **73%** |
| Growth | $0.025 | $0.008 | **68%** |
| Professional | $0.02 | $0.008 | **60%** |
| Studio | $0.015 | $0.008 | **47%** |

**Note:** Even at Studio tier, you have 47% margin which is healthy.

---

## Revised Unit Economics Summary

### Our True Cost Per Photo

**Per uploaded photo (realistic):**
- AWS Rekognition: $0.00161
- Cloudflare R2: $0.00006
- FTP Server: $0.0004
- LINE (averaged): $0.00429
- Overhead (30%): $0.002
- **Total: $0.008** (฿0.26)

### Compared to Competitors

| Platform | Cost/Photo | Charge/Photo | Margin |
|----------|-----------|--------------|--------|
| FaceLink | $0.008 | $0.015-0.04 | 47-80% |
| Pixid | ~$0.01 | $0.0935-0.62 | 89-98% |
| SiKram | ~$0.01 | $0.0446-0.062 | 78-84% |

**Key insight:** Our actual cost is $0.008, not $0.01. LINE is included but averaged.

---

## Real-World Example: 300 photos/month

**Scenario:** Photographer uploads 300 photos, 50 actually get sent via LINE

**FaceLink charges:**
- 300 photos × $0.025 = **฿7.50** (~$7.50/month)

**Actual cost:**
- AWS/R2/FTP: 300 × $0.00207 = $0.62
- LINE: $42.88 ÷ (300 photos assumed) = $0.14
- Overhead: $0.10
- **Total cost: $0.86**

**Margin:** $7.50 - $0.86 = **$6.64 (88% margin for this customer)**

**Why so high?**
- Your baseline LINE cost ($42.88) covers up to ~10,000 photos across all customers
- This photographer only uses 3% of capacity
- You're very profitable on this customer

**At scale (full capacity):**
- 10,000 photos across all customers
- LINE cost spreads across them
- Profit margin normalizes to 60-70%

---

## Conclusion

### Corrected Cost Model

1. **Base cost per uploaded photo: $0.008** (including LINE averaged)
2. **Not all photos trigger LINE cost** (only ~5-15% do)
3. **Charge flat rate per photo** ($0.015-0.04 depending on tier)
4. **Maintain 47-80% margin** even with LINE included

### Revised Pricing

| Tier | Price | Margin |
|------|-------|--------|
| Studio | $0.015 | 47% |
| Professional | $0.02 | 60% |
| Growth | $0.025 | 68% |
| Starter | $0.03 | 73% |
| Pay-as-you-go | $0.04 | 80% |

**Still 40-50% cheaper than Pixid, with healthy margins.**

---

**Last Updated:** 2025-12-01

**Status:** Unit economics corrected for realistic LINE usage

