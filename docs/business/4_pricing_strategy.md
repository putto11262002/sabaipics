# Phase 4: Pricing Strategy & Positioning

**Status:** IN PROGRESS - CEO Interview Complete, Strategy Designed

**Date:** 2025-12-01

**Exchange Rate:** 1 USD = 31.96 THB

---

## CEO Strategic Vision

**Primary Customer:** Both photographers + participants, but launch with photographers first

**Revenue Model:** Hybrid - Prepaid Credits + Pay-as-You-Go (volume discounts for bulk purchase)

**Competitive Edge:** **Lower price** than Pixid/SiKram

**Pricing Basis:** Per-photo (aligns with actual infrastructure cost)

**Feature Strategy:** Everything included for all customers (no tiering, no feature gating)

**Monetization v1.1:** Photo sales (photographers can monetize), split revenue 90/10

---

## Why Per-Photo Pricing?

### Cost Alignment
- Infrastructure cost per photo: **$0.00436**
- Per-search cost: **$0.00623**
- LINE message (50% of photos): **$0.00872**

**Per-photo pricing is transparent and fair** - customers understand exactly what they pay for.

### Competitor Comparison

| Competitor | Pricing Model | Complexity | Transparency |
|-----------|---------------|-----------|--------------|
| **Pixid** | Per-event: 299-1,990 THB + tiers + credits | ⚠️ High (credit expiry, tiers) | ❌ Low |
| **SiKram** | Credit-based: 1,990-9,990 THB + tiers | ⚠️ High (credits, tier confusion) | ❌ Low |
| **MangoMango** | Per-event custom pricing | ⚠️ Medium (sales friction) | ❌ Low |
| **FaceLink (Us)** | Per-photo flat + bulk discount | ✅ Low (simple, clear) | ✅ High |

---

## Credit Definition

**1 credit = 1 image uploaded**

| Constraint | Requirement |
|------------|-------------|
| **Format** | JPEG |
| **Max file size** | 5 MB |

**What's included per credit:**
- Storage (original + processed + thumbnail)
- AI face detection (avg 3 faces per photo)
- Face embedding generation
- Face matching when attendees search
- LINE delivery of matched photos

**Not counted as credits:**
- Attendee selfie searches (free for attendees)
- Photo views/downloads by attendees

---

## Proposed Pricing Model: "Credits + Overage"

### The Philosophy

**Goal:** Maximize pricing transparency while incentivizing bulk purchase.

**Model:**
1. Buy prepaid credits at bulk discount
2. Use credits at flat per-photo rate
3. Overage billing at slightly higher per-photo rate (pay-as-you-go)
4. No feature gating, no tier limits
5. Credits have source-based expiration:
   - Purchased credits: 1 year expiry
   - Signup bonus credits: 1 month expiry
   - Promo credits: variable expiry
6. FIFO consumption: use soonest-expiring credits first

### Tier Structure

#### Photographer Pricing (Primary Customer)

**What's included in ALL tiers:**
- AI face detection + embedding
- AI face search
- QR-based gallery
- Branding (logo/watermark)
- LINE integration
- FTP + Lightroom plugin
- Desktop app + Web upload
- Unlimited events
- Multi-language (Thai + English)
- Real-time delivery
- 5 MB per photo limit (normalized JPEG)

**Pricing (Per Photo):**

| Package | Photos | Price per Photo | Total Cost | Savings vs Overage | Use Case |
|---------|--------|-----------------|------------|-------------------|----------|
| **Pay-as-you-go** | Any (overage) | **$0.05** (฿1.60) | N/A | Baseline | Small events, testing |
| **Starter** | 500 photos | **$0.04** (฿1.28) | $20 (฿639) | 20% | 1-2 small events |
| **Growth** | 2,000 photos | **$0.035** (฿1.12) | $70 (฿2,237) | 30% | 4-6 medium events |
| **Professional** | 5,000 photos | **$0.03** (฿0.96) | $150 (฿4,794) | 40% | 10-15 events/month |
| **Studio** | 10,000 photos | **$0.025** (฿0.80) | $250 (฿7,990) | 50% | 20+ events/month (heavy users) |

**Credit Details:**
- Credits never expire (no scarcity tactic)
- Unused credits roll over to next month
- Can purchase additional credits any time at overage rate ($0.05)
- Bulk discounts apply to refills (e.g., buy 1,000 photos at Growth tier rate)

#### Participant Pricing (Secondary, Launch v1.1)

**MVP (Launch):** Free downloads (monetize via photographer payments)

**v1.1 (Photo Monetization):**
- Photographers set own photo prices (e.g., $0.50-$2 per photo)
- FaceLink takes 10% commission on photo sales
- Participants charged only when purchasing (most download free via QR)

---

## Competitive Price Comparison

### Pixid (Market Leader)

| Tier | Price | Per-Event Estimate (100 photos) | Per-Photo Cost |
|------|-------|--------------------------------|-----------------|
| Basic (299 THB) | 299 THB | ~300 THB | 3.0 THB |
| Premium (699 THB) | 699 THB | ~700 THB | 7.0 THB |
| Ultra (1,990 THB) | 1,990 THB | ~2,000 THB | 20.0 THB |

### SiKram (Shark Tank Backed)

| Tier | Price | AI Credits | Per-Photo Cost (est.) |
|------|-------|------------|----------------------|
| Basic (1,990 THB) | 1,990 THB | 1,000 faces | ~2.0 THB |
| Pro (4,990 THB) | 4,990 THB | 3,000 faces | ~1.7 THB |
| Elite (9,990 THB) | 9,990 THB | 7,000 faces | ~1.4 THB |

### FaceLink (Our Model)

| Package | Per-Photo Cost | Effective per 100-photo event | Notes |
|---------|----------------|-------------------------------|-------|
| Pay-as-you-go | 1.60 THB | 160 THB | No commitment |
| Starter | 1.28 THB | 128 THB | 20% discount |
| Growth | 1.12 THB | 112 THB | 30% discount |
| Professional | 0.96 THB | 96 THB | **40% cheaper than Pixid** |
| Studio | 0.80 THB | 80 THB | **50% cheaper than Pixid** |

---

## Why This Works (Modern SaaS Principles)

### 1. **Transparency > Complexity**
- No credits with expiry dates (Pixid)
- No tier confusion (SiKram's 1000 vs 3000 vs 7000 credits)
- Simple: photos uploaded = photos paid
- Builds trust

### 2. **Incentives Without Pressure**
- Bulk discounts reward loyalty
- Pay-as-you-go prevents "forced tier upgrade"
- No credit waste or "use it or lose it"

### 3. **Aligns with Value Delivery**
- Cost per photo: $0.00436
- Charge: $0.025-0.05 per photo
- Margin: 5-10x cost (healthy 80-90% margin)
- Scales naturally with usage

### 4. **Two-Sided Revenue (v1.1)**
- Photographers: charge upfront (baseline revenue)
- Participants: photo monetization 10% fee (growth lever)
- Neither side forces the other to pay (flexibility)

### 5. **Switching Incentive**
- Pixid user with 200 photos/month pays 699 THB (7.0 THB/photo)
- Switch to FaceLink: pay 56 THB/month (0.96 THB/photo)
- **They save 620 THB/month** = strong switching incentive

---

## Pricing by Customer Segment

### Active Event Photographers (Primary Target)

**Profile:** 10-50 events/year, 50-500 photos per event

**Recommendation:** Growth tier ($70/month) or Professional ($150/month)
- Growth: 8-12 events at 100-200 photos each
- Professional: 15-25 events
- Savings: 30-40% vs pay-as-you-go

### Professional Studios (High Volume)

**Profile:** 50+ events/year, 500+ photos per event

**Recommendation:** Studio tier ($250/month)
- 20+ events per month
- Savings: 50% vs pay-as-you-go
- Path to monetization v1.1 (photo sales)

### Casual/Testing Users

**Profile:** 1-2 events, testing platform

**Recommendation:** Pay-as-you-go or Starter ($20)
- No commitment
- Low risk
- Can upgrade if they like it

---

## Revenue Projections (Illustrative)

### Scenario: 100 photographers, mix of tiers

| Segment | Count | Avg Tier | Monthly Revenue |
|---------|-------|----------|-----------------|
| Studio | 10 | Studio ($250) | $2,500 |
| Professional | 30 | Professional ($150) | $4,500 |
| Growth | 40 | Growth ($70) | $2,800 |
| Starter | 20 | Starter ($20) | $400 |
| **Total** | **100** | - | **$10,200/month** |

**Gross Margin:** ~85% (revenue - infrastructure cost)

**Note:** Photography sales (v1.1) would add 10% commission on photographer-set prices. This is growth lever post-launch.

---

## Differentiation vs Competitors

| Factor | Pixid | SiKram | FaceLink |
|--------|-------|--------|----------|
| **Per-photo visibility** | ❌ Hidden in tier | ❌ Hidden in credits | ✅ Crystal clear |
| **Feature gating** | ⚠️ AI locked to Ultra | ⚠️ Credits limit usage | ✅ All features always |
| **Credit expiry** | ❌ Yes (30-90 days) | ❓ Unclear | ✅ Never expires |
| **Price transparency** | ❌ Confusing tiers | ❌ Credit confusion | ✅ Simple per-photo |
| **Bulk discount incentive** | ✅ Yes | ✅ Yes | ✅ Yes (better) |
| **Low-friction entry** | ⚠️ 299 THB minimum | ⚠️ 1,990 THB minimum | ✅ 160 THB pay-as-you-go |
| **Price position** | Premium | Mid-market | **Value leader** |

---

## Rollout Strategy

### MVP Launch (v1.0)
- Photographer-focused pricing
- 5 tiers (Pay-as-you-go + 4 prepaid tiers)
- Simple dashboard showing credits + overage
- Transparent pricing page

### v1.1 (2-4 weeks post-launch)
- Photo monetization (photographer-set pricing, 10% fee)
- Analytics on participant purchases
- Revenue sharing dashboard

### v2 (6+ weeks post-launch)
- Team/agency pricing (multiple photographers on one account)
- Annual billing discount (10-15% off monthly)
- API for enterprise integration

---

## Assumptions to Validate (Phase 5)

1. **Do photographers care about simplicity over features?**
   - Will they switch from Pixid/SiKram for cheaper pricing + transparent model?

2. **Is per-photo pricing clear enough?**
   - Or do photographers prefer per-event flat rates?

3. **What's acceptable price point?**
   - Are they willing to pay $0.025/photo if features are complete?

4. **Photo monetization timing?**
   - Should we ship with v1.0 or wait for v1.1?

5. **Two-sided dynamics?**
   - If we charge photographers AND take commission on sales, do we cannibalize?

---

## Next Steps (Phase 5)

1. **Market validation:** Interview 5-10 photographers
   - Would they switch from Pixid/SiKram?
   - What's their per-event photo count?
   - Sensitivity: Price elasticity at $0.025 vs $0.05 vs $0.10

2. **Competitor validation:** Mystery shop Pixid/SiKram
   - Confirm exact pricing + credit mechanics
   - Test actual per-photo costs in real usage

3. **Pricing sensitivity analysis:**
   - At what price do photographers hesitate?
   - What's the maximum discount before it feels cheap/low-quality?

4. **Two-sided validation:**
   - Interview participants: would they pay for photos?
   - What price point? ($0.50? $1.00? $2.00?)

---

**Last Updated:** 2025-12-01

**Status:** Ready for Phase 5 Market Validation

