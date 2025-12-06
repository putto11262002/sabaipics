---
title: Feature Positioning
description: Define what we build and what we skip. Fast-follower strategy - copy proven features, compete on execution.
---

# Feature Positioning

## Strategic Lens

**Our competitors:** Pixid + SiKram (not MangoMango - they're enterprise/niche)

**Our strategy:** Fast-follower + Drop-in Replacement
- Copy what's proven to work
- Match existing photographer workflows (they shouldn't change how they work)
- Compete on execution (simpler, faster, cleaner)
- Don't innovate on features - innovate on UX and pricing

**Our edge (from Phase 1):**
- Simpler pricing (no credits, no midnight expiry, no tier confusion)
- Better UX for BOTH sides (photographer + participant)
- LINE-native experience

---

## Feature Selection Framework

### Labels

| Label | Meaning | Criteria |
|-------|---------|----------|
| **MVP** | Must have to compete | Without this, we're not a viable drop-in replacement |
| **v1.1** | Quick win differentiator | Low effort, high impact - ship within weeks of MVP |
| **v2** | Defer to learn | Unsure if needed - wait for user feedback |
| **Never** | Not our fight | Competitors have it but we skip intentionally |

---

## Feature Decisions

### Photographer Side (B2B)

| Feature | Pixid | SiKram | Decision | Rationale |
|---------|-------|--------|----------|-----------|
| **Upload Methods** | | | | |
| Web upload | Yes | Yes | **MVP** | Basic requirement |
| Desktop app (folder monitor) | Yes | Yes | **MVP** | Drop-in replacement - photographers expect same workflow |
| FTP server endpoint | Yes | Yes | **MVP** | Simple backend, enables pro camera workflows (Nikon Z8/Z9) |
| Lightroom plugin | Yes | Yes | **MVP** | Open source Lua auto-export plugin exists - build on that |
| **Photo Processing** | | | | |
| AI face recognition | Yes | Yes | **MVP** | Core value prop |
| AI quality filter (blur/eyes) | No | Yes | **v1.1** | Post-launch quick win based on feedback |
| LUT/color grading | Yes | No | **Never** | Not our edge - we don't compete on photo editing |
| Photo adjustments (exposure, contrast, etc.) | Yes | Yes | **Never** | Not our fight - we don't compete on photo editing |
| **Gallery/Delivery** | | | | |
| QR code generation | Yes | Yes | **MVP** | Core delivery mechanism |
| Basic gallery theming | Yes | Yes | **MVP** | Logo upload, background color, basic layout |
| Branding (logo/watermark on photos) | Yes | Yes | **MVP** | Drop-in replacement - photographers expect this |
| Multi-language | Yes | Yes | **MVP** | Thai + English minimum |
| LINE integration | Yes | Yes | **MVP** | Table stakes in Thailand [TBD in 3a_technical_analysis.md] |
| **Platform** | | | | |
| Event/project management | Yes | Yes | **MVP** | Basic organization |
| Analytics/stats | Yes | Yes | **v1.1** | Simple stats post-launch |

### Participant Side (B2C)

| Feature | Pixid | SiKram | Decision | Rationale |
|---------|-------|--------|----------|-----------|
| QR → gallery access | Yes | Yes | **MVP** | Core flow |
| AI face search | Yes | Yes | **MVP** | Core value prop |
| Web gallery (no app) | Yes | Yes | **MVP** | Zero friction |
| Download photos | Yes | Yes | **MVP** | Basic requirement |
| Social login (LINE, Google) | No | Yes | **MVP** | No email/password - social only |
| Face Capture (selfie upload) | No | Yes | **MVP** | Required for face search [TBD in 3a_technical_analysis.md] |
| Photo purchase | No | Yes | **v2** | Defer until PMF, ~1-2 months post-launch |

### Unique to Us (Differentiation)

| Feature | Competitors | Decision | Rationale |
|---------|-------------|----------|-----------|
| Simple per-event pricing | Neither | **MVP** | Core differentiator |
| No credit system | Neither | **MVP** | Core differentiator |
| Transparent pricing page | Neither | **MVP** | Trust builder |
| LINE Mini App / LIFF | Neither | [TBD in 3a_technical_analysis.md] | Depends on LINE technical capabilities |

---

## MVP Definition (v1)

### Must Ship

| Side | Features |
|------|----------|
| **Photographer** | Web upload, Desktop app (folder monitor), FTP endpoint, Lightroom plugin, AI face recognition, QR code, Basic gallery theme, Branding (logo/watermark), LINE integration, Event management, Thai + English |
| **Participant** | QR → gallery, Face capture (selfie), AI face search, Web gallery, Download photos, Social login (LINE/Google) |
| **Platform** | Simple per-event pricing, No credits/tiers, Transparent pricing |

### v1.1 (Ship within weeks)

- AI quality filter (blur/closed-eye detection)
- Analytics/stats dashboard
- LINE Mini App (if technically viable - see [log/001](log/001.md))

### Explicitly NOT Building

| Feature | Why |
|---------|-----|
| LUT/color grading | Not our edge - we don't compete on photo editing |
| Photo adjustments | Not our fight - we don't compete on photo editing |
| Photobooth | Niche, complex |
| Photo sales/monetization | Defer until PMF |
| Complex analytics | Overkill for MVP |

---

## Deferred Decisions

See [log/index.md](log/index.md) for open questions.

| # | Topic | Resolve In |
|---|-------|------------|
| [001](log/001.md) | Participant Flow + LINE Architecture | Phase 3 |

---

## Gate Assessment

**Gate Question:** Do we know WHAT we're building?

**Passing Criteria:**
- [x] MVP feature set defined and agreed
- [x] Clear rationale for each decision
- [x] v1.1 priorities identified
- [x] "Never" list established
- [x] Deferred questions logged for Phase 3

**Answer: YES** [GATE PASSED]

---

**Ready to proceed to:** [3a_technical_analysis.md]
