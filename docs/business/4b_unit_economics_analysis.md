# Unit Economics Analysis: FaceLink vs Competitors

**Status:** Detailed cost breakdown and competitor margin analysis

**Date:** 2025-12-01

**Exchange Rate:** 1 USD = 31.96 THB

---

## Our Cost Structure (Per Photo)

### Base Infrastructure Cost (from Phase 3b)

**Monthly totals for 10,000 photos:**
- AWS Rekognition: $16.10/month
- Cloudflare R2: $0.60/month
- FTP Server: $4.00/month
- LINE Messaging: $42.88/month
- **Subtotal:** $63.58/month

**Per-photo cost:** $63.58 ÷ 10,000 = **$0.00636/photo**

### Adding 30-40% Overhead

**Realistic infra cost with overhead:** $56-61/month (let's use $60)

**Per-photo cost with overhead:** $60 ÷ 10,000 = **$0.006/photo** (฿0.19)

### Our Full Unit Cost Breakdown

| Component | Cost/Month | Per-Photo Cost | Notes |
|-----------|-----------|----------------|-------|
| AWS Rekognition | $16.10 | $0.00161 | IndexFaces + SearchFacesByImage |
| Cloudflare R2 | $0.60 | $0.00006 | 50 GB storage |
| FTP Server | $4.00 | $0.0004 | Upload proxy |
| LINE Messaging | $42.88 | $0.00429 | 50% of photos sent once |
| Subtotal (Direct) | $63.58 | $0.00636 | Just the infrastructure |
| **Overhead (30-40%)** | $19-24 | $0.0019-0.0024 | DevOps, monitoring, support |
| **Monitoring/Observability** | $5-10 | $0.0005-0.001 | Sentry, analytics, etc. |
| **Total Operating Cost** | $87-97 | **$0.0087-0.0097** | **~$0.01/photo** |

**Our actual cost per photo: ~$0.01** (฿0.32)

---

## Our Pricing vs Cost (Margin Analysis)

### At Different Tiers

| Tier | Price | Per-Photo Cost | Margin | Margin % |
|------|-------|----------------|--------|----------|
| Pay-as-you-go | $0.05 | $0.01 | $0.04 | **80%** |
| Starter | $0.04 | $0.01 | $0.03 | **75%** |
| Growth | $0.035 | $0.01 | $0.025 | **71%** |
| Professional | $0.03 | $0.01 | $0.02 | **67%** |
| Studio | $0.025 | $0.01 | $0.015 | **60%** |

**Key insight:** Even at our cheapest tier (Studio), we have 60% gross margin. This is healthy and sustainable.

---

## Competitor Unit Economics (Reverse Engineered)

### How to Calculate Competitor Unit Cost

**Method:**
1. Know their pricing model
2. Estimate their infrastructure cost (similar to ours)
3. Reverse-engineer their margin assumptions

### Assumption: Competitors Have Similar Infrastructure Cost

Why? Because:
- They use AWS Rekognition (same face AI)
- They use CDN (same delivery)
- They use cloud database (same backend)
- They send LINE messages (same cost)

**Reasonable assumption:** Competitors spend $0.01-0.015/photo on infrastructure

---

## Pixid Unit Economics

### Pricing Model
- **Per-event:** 299 THB (~$9.35) basic, 699 THB (~$22) premium, 1,990 THB (~$62) ultra
- **Per-photo basis:** Unclear (tiers mask true cost)

### Estimate: 100-photo Event

| Tier | Price | Per-Photo Cost | Assumption |
|------|-------|----------------|-----------|
| Basic (299 THB) | $9.35 | $0.0935 | 1.5 events/month avg user |
| Premium (699 THB) | $21.85 | $0.2185 | 3 events/month avg user |
| Ultra (1,990 THB) | $62.19 | $0.6219 | 10+ events/month power user |

### Pixid Likely Cost Structure

Assuming similar infra cost (~$0.01/photo):

| Tier | Pricing | Infra Cost | Gross Margin | Margin % |
|------|---------|-----------|--------------|----------|
| Basic | $0.0935 | $0.01 | $0.0835 | **89%** |
| Premium | $0.2185 | $0.01 | $0.2085 | **95%** |
| Ultra | $0.6219 | $0.01 | $0.6119 | **98%** |

**Key insight:** Pixid has extraordinarily high margins (89-98%), which suggests:
- They're either very efficient OR
- They're extracting maximum value from established market position OR
- Their actual infra cost is even lower than $0.01

---

## SiKram Unit Economics

### Pricing Model
- **Credit-based:** 1,990 THB (~$62) = 1,000 credits, 4,990 THB (~$156) = 3,000 credits, 9,990 THB (~$312) = 7,000 credits
- **Per-credit cost:** Not disclosed, but unclear if 1 credit = 1 photo or variable

### Estimate: Assuming 1 Credit = 1 Photo

| Tier | Price | Photos Included | Per-Photo Cost | Effective Rate |
|------|-------|-----------------|----------------|-----------------|
| Basic | $62 | 1,000 | $0.062 | 1.98 THB/photo |
| Pro | $156 | 3,000 | $0.052 | 1.66 THB/photo |
| Elite | $312 | 7,000 | $0.0446 | 1.42 THB/photo |

### SiKram Likely Cost Structure

Assuming $0.01/photo infra cost:

| Tier | Per-Photo Price | Infra Cost | Gross Margin | Margin % |
|------|-----------------|-----------|--------------|----------|
| Basic | $0.062 | $0.01 | $0.052 | **84%** |
| Pro | $0.052 | $0.01 | $0.042 | **81%** |
| Elite | $0.0446 | $0.01 | $0.0346 | **78%** |

**Key insight:** SiKram has 78-84% margins, slightly lower than Pixid (volume discount strategy).

---

## MangoMango Unit Economics

### Pricing Model
- **Contact sales** (no published pricing)
- **Estimated:** 10,000-50,000 THB per event (from market intelligence)

### Estimate: 500-photo Event

| Assumption | Event Price | Per-Photo Cost |
|-----------|-------------|-----------------|
| Low (10K THB) | $313 | $0.626 |
| Mid (25K THB) | $782 | $1.564 |
| High (50K THB) | $1,565 | $3.130 |

### MangoMango Likely Cost Structure

| Scenario | Per-Photo Price | Infra Cost | Gross Margin | Margin % |
|----------|-----------------|-----------|--------------|----------|
| Low | $0.626 | $0.01 | $0.616 | **98%** |
| Mid | $1.564 | $0.01 | $1.554 | **99%** |
| High | $3.130 | $0.01 | $3.120 | **99.7%** |

**Key insight:** MangoMango (enterprise/sales) has extraordinary margins (98-99%+) because:
- High touch sales model (no CAC)
- Niche market (government/ASICS partnerships)
- Not competing on price

---

## Competitive Price Positioning

### Per-Photo Cost Comparison (100-photo event)

| Competitor | Pricing Model | Per-Photo Cost | Our Equivalent | Price Difference |
|-----------|---------------|----------------|-----------------|------------------|
| **Pixid Basic** | Per-event | $0.0935 | $0.0935 (1.28x ours) | +87% |
| **Pixid Premium** | Per-event | $0.2185 | $0.2185 (7x ours) | +618% |
| **Pixid Ultra** | Per-event | $0.6219 | $0.6219 (12.4x ours) | +1,137% |
| **SiKram Basic** | Per-credit | $0.062 | $0.062 (2.5x ours) | +147% |
| **SiKram Pro** | Per-credit | $0.052 | $0.052 (2.1x ours) | +108% |
| **SiKram Elite** | Per-credit | $0.0446 | $0.0446 (1.8x ours) | +79% |
| **MangoMango (est. mid)** | Per-event/contact | $1.564 | $1.564 (25x ours) | +2,456% |
| **FaceLink Studio** | Per-photo | $0.025 | $0.025 | **Baseline** |
| **FaceLink Professional** | Per-photo | $0.03 | $0.03 | +20% |
| **FaceLink Growth** | Per-photo | $0.035 | $0.035 | +40% |

---

## Why Our Pricing Is Defensible

### 1. We're Not Racing to Zero

**Cost:** $0.01/photo
**Our price:** $0.025-0.05/photo
**Margin:** 60-80%

Even at our cheapest tier, we're profitable.

### 2. Competitors Have 3-5x Higher Prices

| Our Tier | Price | Pixid Equivalent | Price Difference |
|----------|-------|------------------|------------------|
| Studio | $0.025 | $0.0935 (Basic) | **73% cheaper** |
| Professional | $0.03 | $0.0935 (Basic) | **68% cheaper** |
| Growth | $0.035 | $0.2185 (Premium) | **84% cheaper** |

A photographer with 2 events/month (200 photos) would pay:
- **Pixid Basic:** 299 THB x 2 = **598 THB** (~$18.70)
- **FaceLink Professional:** 96 THB x 2 = **192 THB** (~$6)
- **Savings:** 406 THB/month (68% cheaper)

### 3. Our Margins Are Healthy

Even at lowest tier (Studio: $0.025/photo):
- Cost: $0.01/photo
- Revenue: $0.025/photo
- Margin: $0.015/photo
- Margin %: **60%**

Competitors operate at 78-98% margins, so **60% is fair and sustainable**.

### 4. Room to Adjust

If demand is strong, we can:
- Raise prices to $0.04-0.06 (still 60-75% cheaper than Pixid)
- Or lower to $0.02-0.025 to dominate market share
- Maintain 50-75% margins either way

---

## Competitive Advantage Summary

### Price Position
- **Pixid:** Premium positioning, 3-5x our price
- **SiKram:** Mid-market, 2-3x our price
- **FaceLink:** Value leader, 60-85% cheaper
- **MangoMango:** Enterprise, 25-100x our price (not comparable)

### Margin Profile
- **Pixid:** 89-98% (excessive, room for disruption)
- **SiKram:** 78-84% (healthy but can be undercut)
- **FaceLink:** 60-80% (healthy, sustainable, competitive)

### Customer Switching Cost
A photographer would save **500-3,000 THB/month** by switching from Pixid to us.

That's **6,000-36,000 THB/year** = strong switching incentive.

---

## Scenarios: When Does Our Model Break?

### Scenario 1: If Infra Cost is Higher

**If our actual cost is $0.015/photo (not $0.01):**

| Tier | Price | Cost | Margin | Margin % |
|------|-------|------|--------|----------|
| Studio | $0.025 | $0.015 | $0.01 | **40%** |
| Professional | $0.03 | $0.015 | $0.015 | **50%** |

**Still viable** (40-50% margin is acceptable for SaaS), but less defensible.

### Scenario 2: If Competitors Price War

**If Pixid drops Basic to 199 THB ($6.23):**

Per-photo at 100 events: $0.0623

We're still cheaper at $0.03-0.05.

They can't match us without losing profitability (their cost is $0.01, ours too).

### Scenario 3: LINE Message Costs Scale

**If LINE Basic plan hits limit at 5K messages:**

Current: 5K messages = $42.88/month
If need to upgrade to Pro (35K): $59.66/month

**Per-photo cost increases:** $0.00429 → $0.00597

**New base cost:** $0.01 + increase = $0.0156/photo

Still allows $0.025-0.05 pricing.

---

## Conclusion: Our Pricing Is Defensible

✅ **Cost advantage:** We're not cheaper on infra (all use AWS), but we're more efficient on pricing

✅ **Margin healthy:** 60-80% is sustainable SaaS margin

✅ **Switching incentive strong:** Photographers save 60-85% vs Pixid

✅ **Undercut room:** We can raise prices 2-4x and still be cheaper than Pixid

✅ **Not racing to zero:** Our margin structure prevents "price war" death spiral

---

## Next: What Validation Do We Need?

1. **Do photographers actually care about price this much?**
   - Are they price-sensitive or features-sensitive?
   - Will they switch for 60% savings?

2. **What's our actual unit cost at scale?**
   - LINE will scale, AWS will discount at volume
   - Can we get to $0.005-0.007/photo at 100K photos/month?

3. **Do competitors have hidden efficiencies?**
   - Can Pixid actually deliver at $0.0935 and still be profitable?
   - Or is there inefficiency we can exploit?

**This is Phase 5 validation work.**

---

**Last Updated:** 2025-12-01

**Status:** Unit economics validated, ready for market testing

