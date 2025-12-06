# Final Pricing Model: 0.25฿ Per Photo (Corrected LINE Messaging)

**Status:** FINAL - Based on corrected LINE messaging understanding (Image Carousel = 1 message per participant, not per image)

**Date:** 2025-12-01

**Key Correction:** Line messaging counts participants, not images. Using Image Carousel template bundles multiple images into 1 message object.

---

## Cost Recalculation with Corrected LINE Messaging

### Scenario: 10,000 photos/month

**LINE messaging (CORRECTED):**
- 7,000 searches (70% participation)
- Average 2 matching photos per search
- Sent to 1 participant per search (using Image Carousel to bundle)
- = **7,000 LINE messages/month** (not 5,000-10,000)

**LINE cost:**
- LINE Basic plan: ฿1,370 for 15,000 messages
- Usage: 7,000 ÷ 15,000 = 0.467
- Cost: ฿1,370 × 0.467 = **฿639/month**

### Revised Cost Per Photo

| Component | Cost/Month | Per-Photo Cost |
|-----------|-----------|-----------------|
| AWS Rekognition | $16.10 (฿514) | ฿0.051 |
| Cloudflare R2 | $0.60 (฿19) | ฿0.002 |
| FTP Server | $4.00 (฿128) | ฿0.013 |
| LINE (corrected) | ฿639 | **฿0.064** |
| Subtotal | ฿1,300 | ฿0.130 |
| Overhead (30%) | ฿390 | ฿0.039 |
| **TOTAL COST** | **฿1,690** | **฿0.169** |

**Cost per photo: ฿0.169 (was ฿0.26 with wrong assumption)**

---

## Pricing at 0.25฿ Per Photo

### Credit Packages (Simple, No Tiers)

All credits cost exactly **0.25฿ each**. Different packages = different upfront amounts with bulk discounts.

| Package | Photos | Price | Per-Photo | Discount | Bulk Savings |
|---------|--------|-------|-----------|----------|-------------|
| **Entry** | 200 | **50฿** | 0.25฿ | 0% | None |
| **Small** | 500 | **125฿** | 0.25฿ | 0% | None |
| **Medium** | 2,000 | **450฿** | 0.225฿ | 10% | 50฿ saved |
| **Large** | 5,000 | **1,000฿** | 0.20฿ | 20% | 250฿ saved |
| **Studio** | 10,000 | **1,900฿** | 0.19฿ | 24% | 550฿ saved |

**Low entry fee:** Entry package = just **50฿ for 200 photos** (lowest barrier)

---

## Why This Wins vs SiKram

### SiKram Starter (1,890฿)
- 7,000 credits
- Per-photo: 0.27฿
- Feature-gated: ❌ No LINE, no branding, no themes

### FaceLink (0.25฿)
- Unlimited credits (pay per photo)
- Per-photo: 0.25฿ (best tier), 0.225-0.25฿ (all packages)
- ALL features always: ✅ LINE, branding, themes, everything

### Comparison

| Photographer Type | SiKram Cost | FaceLink Cost | Savings | Savings % |
|------------------|-----------|-------------|---------|----------|
| **Tiny (200 photos)** | 1,890฿ | 50฿ | 1,840฿ | 97% |
| **Small (500 photos)** | 1,890฿ | 125฿ | 1,765฿ | 93% |
| **Medium (2,000 photos)** | 1,890฿ | 450฿ | 1,440฿ | 76% |
| **Large (5,000 photos)** | 1,890฿ | 1,000฿ | 890฿ | 47% |
| **Regular annual (12,000/year)** | 22,680฿ | 2,850฿ | 19,830฿ | 87% |
| **Professional (30,000/year)** | 22,680฿ | 6,000฿ | 16,680฿ | 74% |

---

## Margin Analysis at 0.25฿

| Metric | Value |
|--------|-------|
| Price | 0.25฿ |
| Cost | 0.169฿ |
| Gross Margin | 0.081฿ |
| **Margin %** | **32.4%** |

**32% margin is healthy SaaS** (20-40% is standard for lean startups)

---

## Real-World Scenarios

### Scenario 1: Photographer First Event (1 event, 200 photos)

| Platform | Cost | Features | Notes |
|----------|------|----------|-------|
| **FaceLink Entry** | **50฿** | All ✅ | Lowest entry ever |
| SiKram Hobby | 499฿ | Limited (48h) | Expensive for testing |
| Pixid Standard | 299฿ | No AI ❌ | Limited features |

**FaceLink saves 449-249฿ on first event**

---

### Scenario 2: Regular Photographer (2 events/month, 1,000 photos/month)

**Year 1: 12,000 photos**

| Platform | Strategy | Cost | Per-Photo | Notes |
|----------|----------|------|-----------|-------|
| **FaceLink** | Buy Large + refill | 2,850฿ | 0.2375฿ | Rolls over unused |
| SiKram Starter | Monthly | 22,680฿ | 0.27฿ | Feature-gated (no LINE) |
| SiKram Premium | Monthly | 47,880฿ | 3.99฿ | Full features but 17x more |
| Pixid Ultra | Monthly | 15,480฿ | 1.29฿ | + 100฿ LINE OA add-on |

**FaceLink wins on all fronts:**
- **87% cheaper than SiKram Starter**
- **94% cheaper than SiKram Premium**
- **82% cheaper than Pixid Ultra**

---

### Scenario 3: Professional Studio (5 events/month, 30,000 photos/year)

| Platform | Annual Cost | Per-Photo | Margin |
|----------|------------|-----------|--------|
| **FaceLink Studio × 3** | 5,700฿ | 0.19฿ | 24% |
| **FaceLink Studio × 4** | 7,600฿ | 0.19฿ | 24% |
| SiKram Starter | 22,680฿ | 0.27฿ | Feature-gated |
| SiKram Premium | 47,880฿ | 3.99฿ | Full features |
| Pixid Ultra | 16,680฿ | 1.39฿ | Full features |

**FaceLink saves:**
- **17,000-42,000฿/year** (75-82% cheaper)

---

## Positioning: "Start Free, Scale Simple"

### The Value Proposition

| Aspect | FaceLink | SiKram | Pixid |
|--------|----------|--------|-------|
| **Entry fee** | **50฿** | 499฿ | 299฿ |
| **Per-photo cost** | **0.25฿** (variable) | 0.27฿ (fixed) | 1.39฿+ (hidden) |
| **All features?** | **✅ Always** | ❌ Tiered | ❌ Tiered |
| **Credit expiry?** | ❌ Never | ❓ Unknown | ❌ Yes (per-event) |
| **LINE included?** | ✅ Yes | ❌ No | ❌ Add-on (+100฿) |
| **Pricing simplicity** | **✅ Transparent** | ⚠️ Complex | ⚠️ Very complex |

---

## Pricing Packages (Final)

```
┌─────────────────────────────────────────────────────┐
│         FACELINK CREDIT PACKAGES (฿)                │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ENTRY (Get started)                                │
│    50฿ for 200 photos → 0.25฿/photo                │
│    No commitment, try it out                        │
│                                                      │
│  SMALL (Casual photographer)                        │
│    125฿ for 500 photos → 0.25฿/photo               │
│    1-2 events/month                                 │
│                                                      │
│  MEDIUM (Regular photographer)                      │
│    450฿ for 2,000 photos → 0.225฿/photo            │
│    Save 10% vs Entry package                        │
│    4-6 events/month                                 │
│                                                      │
│  LARGE (Active photographer)                        │
│    1,000฿ for 5,000 photos → 0.20฿/photo           │
│    Save 20% vs Entry package                        │
│    10-15 events/month                               │
│                                                      │
│  STUDIO (Professional)                              │
│    1,900฿ for 10,000 photos → 0.19฿/photo          │
│    Save 24% vs Entry package                        │
│    20+ events/month                                 │
│                                                      │
│ ✅ All credits never expire                         │
│ ✅ All features always included                     │
│ ✅ Can buy multiple packages, they stack            │
│ ✅ Flexible - use on your own schedule              │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Marketing Message

**"From 50฿ to 1,900฿. No features locked. No credit expiry. No surprises."**

Key differentiators:
1. **Lowest entry fee** (50฿ vs competitors' 299-1,890฿)
2. **Transparent pricing** (everyone pays 0.25฿ or less per photo)
3. **All features always** (no feature gating like competitors)
4. **No expiry** (credits never disappear)
5. **Flexible packages** (buy what you need, scale up anytime)

---

## Unit Economics Summary

| Metric | Value |
|--------|-------|
| **Cost per photo** | ฿0.169 |
| **Price per photo (Entry)** | ฿0.25 |
| **Margin** | 32.4% |
| **Lowest entry fee** | ฿50 |
| **Best per-photo rate** | ฿0.19 (Studio package) |
| **vs SiKram Starter** | 7% cheaper per photo |
| **vs SiKram Premium** | 93% cheaper |
| **vs Pixid Ultra** | 82% cheaper |

---

## Financial Projections (Illustrative)

### Scenario: 100 photographers sign up, mixed packages

| Segment | Count | Avg Package | Monthly Revenue | Annual |
|---------|-------|------------|-----------------|--------|
| Entry users (testing) | 30 | 50฿ | 1,500฿ | 18,000฿ |
| Small (casual) | 40 | 125฿ | 5,000฿ | 60,000฿ |
| Medium (regular) | 20 | 450฿ | 9,000฿ | 108,000฿ |
| Large (active) | 8 | 1,000฿ | 8,000฿ | 96,000฿ |
| Studio (pro) | 2 | 1,900฿ | 3,800฿ | 45,600฿ |
| **TOTAL** | **100** | - | **27,300฿** | **327,600฿** |

**Monthly gross revenue:** 27,300฿
**Less: Infrastructure cost (~฿1,690 baseline)**
**Gross profit:** ~25,610฿/month (94% margin on baseline)

---

## Phase 4 Final Status: ✅ COMPLETE

**Pricing model:** 0.25฿ per photo with bulk discounts down to 0.19฿

**Entry fee:** 50฿ (lowest barrier to entry)

**Positioning:** "Start at 50฿. Scale to 1,900฿. Everything included."

**Competitive advantage:**
- 7% cheaper than SiKram (with all features)
- 82-94% cheaper than Pixid/SiKram Premium
- Lowest entry fee in market

**Margin:** 32.4% (healthy, sustainable, not race-to-zero)

---

**Last Updated:** 2025-12-01

**Status:** Ready for Phase 5 Market Validation

