---
title: FaceLink Business Position
description: Consolidated summary of FaceLink strategy based on completed Phase 1-4 research and decisions. Only includes validated facts from approved docs.
---

# FaceLink: Business Position

**Status:** Phase 4 complete. Ready for Phase 5 validation.

**Date:** 2025-12-02

---

## What We're Building

From 0_initial_concept.md:

**Two-sided platform connecting event photographers with participants seeking their photos.**

- Photographer workflow: Seamless photo upload + AI facial recognition
- Participant workflow: Fast, intuitive photo discovery via QR + selfie search
- Core value: Minimize time-to-distribution while maximizing simplicity
- Strategy: Fast Follower approach (proven features from competitors, better execution + pricing)

---

## Market Validation (Phase 1-2 Complete)

From 1_competitive_landscape.md + 1b_competitor_feature_deep_dive.md:

**What we know:**
- Demand exists (competitors Pixid, SiKram, MangoMango operate successfully)
- Market is expensive (entry fees: 299฿-1,890฿ per event/month)
- Feature-gating is common (LINE, branding locked behind premium tiers)
- Switching cost is low (event-based model, no lock-in)

**Competitor pricing (verified):**
- Pixid: ฿299 (Standard, no AI) → ฿1,290 (Ultra, full features)
- SiKram: ฿499 (Hobby, 48h) → ฿1,890 (Starter) → ฿3,990 (Premium)
- MangoMango: ฿1,500 (S: 500 photos) → ฿52,000 (XL: 20K photos)

---

## Features We're Building (Phase 2 Complete)

From 2_feature_positioning.md:

**Photographer side:**
- Upload event photos
- AI facial recognition (AWS Rekognition)
- QR code for participants
- Storage

**Participant side:**
- Scan QR code
- Take selfie for verification
- Search for themselves using face AI
- Download via web OR receive via LINE

**No feature gating:** All features available at every price tier.

---

## Technical Architecture (Phase 3a Complete)

From 03_tech_decisions.md + decision logs:

**Infrastructure choices:**
- Image recognition: AWS Rekognition (face detection + search)
- Storage: Cloudflare R2 (geographic redundancy, zero egress)
- API backend: Hono + Cloudflare Workers (serverless)
- Real-time: Cloudflare Durable Objects (WebSocket)
- Web hosting: Cloudflare Pages (static site, cached)
- Alternative upload: FTP VPS (optional low-cost channel)
- Messaging: LINE Official Account (primary distribution)

**Why this stack:**
- Single vendor (Cloudflare) for simplified integration
- Industry-standard components (AWS for AI, Cloudflare for infrastructure)
- Low operational overhead (serverless, auto-scaling)

---

## Unit Economics (Phase 3b Complete)

From 4h_simplified_pricing_3packages.md + cost analysis:

**Cost per photo: ฿0.169**

| Component | Cost |
|-----------|------|
| AWS Rekognition | ฿0.051 |
| Cloudflare R2 | ฿0.002 |
| FTP Server | ฿0.013 |
| LINE OA (Image Carousel) | ฿0.064 |
| Overhead (30%) | ฿0.039 |
| **TOTAL** | **฿0.169** |

**Key assumption:** Image Carousel template bundles 10 images as 1 message object (billed per recipient, not per image). This cuts LINE costs in half vs single-image approach.

---

## Pricing Model (Phase 4 Complete - APPROVED)

From 4h_simplified_pricing_3packages.md:

**3 core packages:**

| Package | Photos | Price | Per-Photo | Margin % |
|---------|--------|-------|-----------|----------|
| STARTER | 500 | 150฿ | 0.30฿ | 44% |
| PROFESSIONAL | 2,000 | 450฿ | 0.225฿ | 25% |
| STUDIO | 5,000 | 1,000฿ | 0.20฿ | 15% |
| ENTERPRISE | 10,000+ | Contact sales | Custom | 20-40% |

**Key features:**
- All credits never expire
- Credits roll over to next purchase
- No feature gating (same features at every tier)

**Competitive positioning:**

| Scenario | FaceLink | SiKram | Savings |
|----------|----------|--------|---------|
| Testing (500 photos) | 150฿ | 499฿ | **70% cheaper** |
| Regular (2,000 photos) | 450฿ | 1,890฿ | **76% cheaper** |
| Active (5,000 photos) | 1,000฿ | 1,890฿ | **47% cheaper** |

---

## Core Differentiators (Approved)

Based on strategy:

1. **Infrastructure reliability:** Cloudflare R2 + redundancy (same enterprise-grade approach as competitors)
2. **AI/ML accuracy:** AWS Rekognition (same technology as competitors)
3. **Streamlined workflow:** Simple photographer + participant UX (no confusion)
4. **Pricing transparency:** Clear per-photo cost, no hidden add-ons
5. **Low entry barrier:** 150฿ to start (vs 299-499฿ competitors)
6. **Complete features:** No feature gating at any tier

---

## Alignment to North Star (0_initial_concept.md)

**Vision:** Two-sided platform minimizing time-to-distribution while maximizing simplicity.

**How we execute:**
- ✅ Two-sided: Photographer upload ↔ Participant search
- ✅ Event-focused: Designed for event workflow
- ✅ Fast: QR code + instant upload/search/download
- ✅ Simple: 3 pricing tiers, all features included, transparent pricing
- ✅ Competitive: 47-76% cheaper than SiKram, better than feature-gated alternatives

---

## What's Next (Phase 5)

**Market Validation:**
- Demand validation (5_demand_validation.md): Do photographers want to switch?
- Pricing validation (5_pricing_validation.md): Will they pay our prices?

**Decision gate:** 70%+ switching intent + no critical feature gaps = proceed to MVP

---

## What's NOT in This Document

Explicitly removed (not from approved docs):

- Go-to-market strategy (not approved yet)
- Marketing messaging (not finalized)
- Financial projections (not approved)
- Feature roadmap (Phase 6 scope)
- MVP scope (Phase 6 scope)
- Operational details (TBD in Phase 6)

These will be finalized with your input during Phase 5 validation and Phase 6 execution.

---

**Last Updated:** 2025-12-02

**Status:** APPROVED facts only. Ready for Phase 5 validation.
