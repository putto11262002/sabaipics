---
title: Competitive Landscape
description: Summary of existing event photo distribution platforms. Synthesizes competitor research into table-stakes features, differentiation opportunities, and pricing benchmarks.
---

# Competitive Landscape

## Market Overview

The Thai event photo distribution market is dominated by **three established players**. All have achieved product-market fit and are actively innovating. Lock-in is low (event-based usage), which validates our fast-follower strategy but means we must compete on per-event value.

**Key Market Characteristics:**
- Mature AI face recognition technology (96-99% accuracy is standard)
- LINE integration is table-stakes in Thailand
- Pricing: **~800 THB/event** (occasional) or **1,390-3,990 THB/month** (regular)
- All competitors expanding internationally (threat window narrowing)
- Running events are a distinct vertical with different business model (participants pay for photos)

---

## Competitor Summary

| Competitor | Market Position | Key Strength | Primary Weakness |
|------------|-----------------|--------------|------------------|
| **Pixid** | Thai market leader | Revolutionary LINE Auto system + 3x upload speed | Premium features gated aggressively |
| **SiKram** | Shark Tank validated, expanding globally | Complete ecosystem (mobile + desktop + service) | Complex credit-based pricing |
| **MangoMango** | Niche player (ASICS-owned) | Government partnerships, running events | Limited to Thai market, no mobile app |

See [1_competitive_landscape/deep_dives/] for full competitor analyses.

---

## Feature Analysis

### Table-Stakes Features
Minimum requirements to compete. Missing any = non-starter.

| Feature | Pixid | SiKram | MangoMango |
|---------|-------|--------|------------|
| **AI Face Recognition** | 98.9% accuracy [VERIFIED] | 99% accuracy [VERIFIED] | 96% accuracy [VERIFIED] |
| **LINE Integration** | LINE OA (+100 THB add-on) | LINE OA (free setup) | LINE + WhatsApp |
| **QR Code Retrieval** | Standard | Zero-friction, no registration | Standard |
| **Cloud Storage** | 5-30 GB by tier | 10-60 GB by tier | Event-based |
| **Real-time Delivery** | 3x faster upload (v0.4.13) | 3-second search | Instant |
| **FTP/Lightroom** | FTP + Lightroom plugin (v0.4.0) | WiFi Direct + PhotoSync | Cloud upload only |

### Differentiator Features

| Feature | Who Has It | Details | Impact |
|---------|------------|---------|--------|
| **LINE Auto** | Pixid | QR → LINE delivery, no app download | Eliminates friction [VERIFIED] |
| **Eye-closed Detection** | Pixid | Auto-curation, Ultra tier only | Premium gating |
| **Video Face Search** | SiKram | AI video recognition (beta) | First-to-market |
| **WiFi Direct Camera** | SiKram | Camera → cloud without computer | Field advantage |
| **Desktop App** | SiKram | Cloud Desktop (beta) for pro workflow | Market expansion |
| **WhatsApp** | MangoMango | Non-LINE delivery | Global reach |
| **On-Site Service** | SiKram | 28,900 THB full event package | High-touch model |
| **Photo Sales/Monetization** | SiKram | Photographers sell to participants, 10% platform fee [VERIFIED - Shark Tank] | Revenue enabler |

### Camera Compatibility

| Competitor | Brands | Connection Methods |
|------------|--------|-------------------|
| **Pixid** | Canon R6II/R5II, Nikon Z-series (13+), Sony Alpha (13+) | FTP, Lightroom, Templates |
| **SiKram** | Canon, Sony, Nikon, Lumix, Fuji, Olympus (6 brands) | WiFi Direct, PhotoSync, FTP |
| **MangoMango** | Not documented | Cloud upload only |

### Feature Gating (What's Locked Behind Premium)

| Competitor | Free/Entry Tier Limitations |
|------------|----------------------------|
| **Pixid** | No AI at 299 THB; AI only Ultra-lite+; Eye-closed only Ultra; FTP: 0→1→3 by tier |
| **SiKram** | AI credits limited: 1,000→3,000→7,000→20,000 by tier |
| **MangoMango** | All tiers include basic AI; enterprise features = contact sales |

### Feature Gaps (Our Opportunity)
No competitor has achieved:
- Unified LINE + WhatsApp delivery (all are single-platform)
- Transparent self-service pricing (all have opacity or complexity)
- Simple flat-rate pricing without credits or limits
- **LINE Mini App experience** - Full app UI inside LINE vs. redirect to web [TBD in 3_cost_analysis.md]

**Note:** Photo monetization exists in SiKram with 10% platform fee [VERIFIED - Shark Tank]. Pixid does NOT have this feature.

### Potential Vertical Opportunity: Running Events
MangoMango dominates running events via Thaidotrun/ASICS ecosystem. However:
- They have contact-sales friction
- No mobile app
- Running events have different model: participants PAY for photos (vs. free delivery)

**Opportunity:** Serve running events + general events with monetization feature.

---

## Pricing Landscape

### Pricing Models in Market

| Model | Used By | Tradeoff |
|-------|---------|----------|
| **Time-based subscription** | Pixid, SiKram | Predictable but revenue ceiling |
| **Credit-based AI** | SiKram | Scales but confuses users |
| **Per-photo** | MangoMango | Transparent but expensive at scale |
| **Event packages** | MangoMango, SiKram | Simple but inflexible |

### Complete Tier Breakdown

**Pixid [VERIFIED]:**

| Tier | Price | Period | Storage | FTP | AI | Key Limitation |
|------|-------|--------|---------|-----|-----|----------------|
| Standard | 299 THB | 14d | 5 GB | 0 | No | No AI, no FTP |
| Pro | 499 THB | 31d | 10 GB | 1 | No | No AI |
| Ultra-lite | 699 THB | Until midnight | 10 GB | 1 | Yes | Expires same day |
| Ultra | 1,290 THB | 31d | 30 GB | 3 | Yes + Auto-curation | Full features |
| Ultra Line Auto | 2,500 THB | Monthly | 30+ GB | 3+ | Premium | 10,000 photo credits |

**Add-ons:** LINE OA (+100 THB), LINE Auto (+100 THB)

**SiKram [VERIFIED]:**

| Tier | Price | Period | Storage | AI Credits | Key Limitation |
|------|-------|--------|---------|------------|----------------|
| Hobby | 499 THB | 48h | 10 GB | 1,000 | Short window |
| Hobby Plus | 999 THB | 48h | 20 GB | 3,000 | Short window |
| Starter | 1,890 THB | Monthly | 20 GB | 7,000 | Mid-tier credits |
| Premium | 3,990 THB | Monthly | 60 GB | 20,000 | Full features |
| Full Service | 28,900 THB | Per event | - | - | On-site staff + equipment |

**Promos:** 9.9 campaign (2nd month = 9 THB); PhotoSync Premium free 1-year bundle [VERIFIED]

**MangoMango [VERIFIED - Dashboard screenshot]:**

| Package | Photo Quota | Price | Participants |
|---------|-------------|-------|--------------|
| S | 500 | ฿1,500 | 50-150 |
| M | 3,000 | ฿9,000 | 200-500 |
| L | 10,000 | ฿28,000 | 600-1,000 |
| XL | 20,000 | ฿52,000 | 1,500-2,000 |

**Note:** +VAT 7%. This is organizer→MangoMango pricing (photo quota model), NOT participant-pays monetization. Parent company thai.run may have participant-pays model for running events [DEFER TO PHASE 3].

### Actual Cost for Full Features (AI + LINE + FTP)

| Scenario | Pixid | SiKram | MangoMango |
|----------|-------|--------|------------|
| **Single event** | 799 THB (Ultra-lite + LINE OA) | 999 THB (Hobby Plus) | 1,500 THB (S package) |
| **Monthly pro** | 1,390-1,490 THB | 1,890-3,990 THB | No monthly option |
| **High volume** | 2,500 THB (10k credits) | 3,990 THB (20k credits) | 28,000 THB (L: 10k photos) |

### Pricing Pain Points

| Competitor | Pain Point | Impact |
|------------|------------|--------|
| **Pixid** | Ultra-lite expires at midnight | Time pressure, no post-event editing |
| **Pixid** | LINE OA is mandatory add-on (+100 THB) | Hidden cost for Thai market |
| **SiKram** | Credit system complexity | Users can't predict costs |
| **SiKram** | 48h packages force repurchase | Multi-day event friction |
| **MangoMango** | No monthly subscription | Must buy per-event package |
| **MangoMango** | Photo quota limits | Overshoot quota = buy larger package |

### Hidden Costs Summary

| Competitor | Advertised Entry | Real Cost (Full Features) | Hidden Add-ons |
|------------|------------------|---------------------------|----------------|
| **Pixid** | 299 THB | 1,390-1,490 THB/mo | LINE OA (100), LINE Auto (100), tier upgrades |
| **SiKram** | 499 THB | 1,890-3,990 THB/mo | Credit overages, tier jumps |
| **MangoMango** | 1,500 THB (S) | 1,500-52,000 THB/event | No hidden costs, but photo quota model |

---

## Competitive Threat Assessment

| Competitor | Threat Level | Rationale |
|------------|--------------|-----------|
| **Pixid** | HIGH | Breakthrough innovation (LINE Auto), 3x speed advantage, aggressive feature development |
| **SiKram** | HIGH | Complete ecosystem, global expansion underway, viral marketing competence |
| **MangoMango** | MEDIUM-LOW | ASICS backing but limited innovation, Thailand-only, contact-sales friction |

### Window of Opportunity
- **CLOSING RAPIDLY** - Both Pixid and SiKram eliminated geographic limitations in 2024-2025
- **Still Open:** No competitor has simple, transparent pricing or multi-platform messaging
- **Risk:** If we don't enter within 6-12 months, competitors may close remaining gaps

---

## User Experience Observations

### Photographer Experience (B2B)
| Aspect | Best-in-Class | Gap |
|--------|---------------|-----|
| Upload Speed | Pixid (3x faster) | Others lag significantly |
| Camera Compatibility | SiKram (6 brands) | Pixid strong on Canon |
| Workflow Integration | Both strong (Lightroom, FTP) | No clear differentiation opportunity |
| Onboarding | SiKram (video tutorials) | All need improvement |

### Attendee Experience (B2C)
| Aspect | Best-in-Class | Gap |
|--------|---------------|-----|
| Photo Discovery | Pixid LINE Auto (zero friction) | Others require app/registration |
| Face Recognition | All similar (96-99%) | Not a differentiator |
| Download/Share | SiKram (Airdrop integration) | Social sharing weak across all |

---

## Strategic Implications for FaceLink

### Validated Assumptions
- [VALIDATED] Market demand exists (three funded competitors)
- [VALIDATED] AI face recognition is commoditized (96-99% achievable)
- [VALIDATED] LINE integration is mandatory for Thai market
- [VALIDATED] Low switching costs = opportunity to capture existing users

### Assumptions Needing Validation
- [NEED VALIDATION] Is pricing complexity a real pain point?
- [NEED VALIDATION] Do photographers want multi-platform messaging?
- [NEED VALIDATION] Is there willingness to switch for simpler UX/pricing?
- [NEED VALIDATION] Can we deliver AI face detection at lower cost? (AI compute is likely biggest cost driver) [TBD in 3_cost_analysis.md]
- [VALIDATED] SiKram offers photo monetization (Sales Report dashboard with platform fee model) [See research/todo.md for follow-ups]

### Competitive Wedge Hypothesis
**Better UX for BOTH sides of the platform:**

| Side | Current Pain Points | Our Opportunity |
|------|---------------------|-----------------|
| **Photographer** | Complex setup, multiple add-ons, credit systems, **midnight expiry pressure** | Simpler onboarding, all-inclusive pricing, **flexible time limits** |
| **Participant** | QR scan + add friend + wait for photos | LINE Mini App = zero friction, instant access [TBD in 3_cost_analysis.md] |

**Pricing simplicity opportunity:** Competitors have confusing tier decisions (Ultra-lite vs Ultra? How many days do I need?). We can offer straightforward per-event pricing without midnight panic.

### Differentiation Opportunities
1. **Transparent, simple pricing** - No credits, no contact sales, flat rates (compete at ~1,400 THB tier)
2. **Two-sided UX advantage** - Better experience for both photographers AND participants
3. **LINE-native experience** - LINE Mini App vs. web redirect [TBD - LINE capabilities research needed]
4. **Better monetization UX** - SiKram takes 10% commission; opportunity for lower rate or better UX
5. **Running events + general events** - Serve market MangoMango dominates but with better UX

### What NOT to Compete On
- AI accuracy (commoditized, 96-99% is standard)
- Feature breadth (avoid bloat - competitors already over-engineered)
- Enterprise/full-service (requires ops we don't have)
- Entry-level price war (bait prices are misleading anyway)

---

## Gate Assessment

**Gate Question:** Do we understand competitor features/pricing enough to position ourselves?

**Answer: YES** [GATE PASSED]

**What we know:**
- Detailed feature matrices for all three competitors
- **Corrected** pricing benchmarks (actual cost: 1,390-3,990 THB/mo for full features)
- Table-stakes vs. differentiator features identified
- Strategic gaps identified (pricing simplicity, two-sided UX, LINE Mini App, photo monetization)
- Competitive wedge hypothesis defined (better UX for both sides)

**Open research items (non-blocking for Phase 2):**
- Photo monetization feature research [See research/todo.md]
- LINE Mini App technical capabilities [Deferred to Phase 3]

**Ready to proceed to:** [2_feature_positioning.md]

---

## References

Detailed competitor analyses:
- [1_competitive_landscape/deep_dives/pixid.md]
- [1_competitive_landscape/deep_dives/sikram.md]
- [1_competitive_landscape/deep_dives/mangomango.md]

Open research items:
- [research/todo.md] - Research gaps and follow-up tasks

