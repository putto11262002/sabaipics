---
title: Pricing Validation
description: Structured customer interview framework to validate willingness-to-pay at proposed 3-package pricing (STARTER 150฿, PROFESSIONAL 450฿, STUDIO 1,000฿). Complements demand validation to confirm switching intent + price acceptance.
---

# Pricing Validation: Phase 5

**Status:** Ready for execution

**Date:** 2025-12-02

**Gate Question:** Will photographers actually pay our proposed prices? Will they switch from current platforms at these prices?

---

## Why Separate Validation

**Demand validation (5_demand_validation.md)** answers: "Do photographers want to switch?"

**Pricing validation (this doc)** answers: "Will they pay OUR prices specifically?"

### The Risk

- Photographers want to switch (low-cost alternative)
- But reject our specific pricing (too high / too low / bad tier structure)
- Or prefer different package sizes

This validation de-risks pricing before MVP.

---

## Interview Approach (5-10 Photographers)

### Target Audience

Same as demand validation:
- Currently using Pixid, SiKram, or MangoMango
- Thai-based (Bangkok, Chiang Mai, Phuket, etc.)
- 2-15 events/month (range of tiers)

### Interview Structure

**Duration:** 20-30 minutes per interview

**Format:** Video call (Zoom/Google Meet) or phone with screen share of pricing table

---

## Part 1: Current Spending Baseline (5 min)

**Goal:** Understand their current spend so we can contextualize our pricing

### Questions

1. **"How many events do you shoot per month?"**
   - Record: [number]
   - Use to estimate their monthly photo volume

2. **"What platform are you using today?"**
   - Record: Pixid / SiKram / MangoMango / Other
   - Follow-up: "How long have you used it?"

3. **"How much do you spend monthly on photo distribution?"**
   - Record: ฿[amount]
   - If unsure: "Roughly, per event? Or annually?"

4. **"What do you like about it? What frustrates you?"**
   - Record: Positive + pain points
   - (Use to validate demand signals from parallel interviews)

---

## Part 2: Willingness-to-Pay Testing (10-12 min)

**Goal:** Test 3 pricing scenarios to identify acceptable range

### Script

"I'm going to show you pricing for a new platform. It's designed specifically for Thai photographers like you. Let me share my screen with our pricing table."

**Show this table:**

```
FACELINK PRICING (Our proposal)

Package        Photos    Price    Per-Photo    Your tier?
STARTER        500       150฿     0.30฿        [ ]
PROFESSIONAL   2,000     450฿     0.225฿       [ ]
STUDIO         5,000     1,000฿   0.20฿        [ ]
```

### Question Set 1: Tier Selection

**"Based on your current usage ([events/month]), which package fits best?"**

- Wait for answer
- Record: Which tier they selected
- If unsure: Help them calculate (e.g., "You said 4 events/month with ~500 photos each = 2,000/month → PROFESSIONAL tier")

### Question Set 2: Price Reaction

**"Looking at the price for that tier, what's your gut reaction?"**
- Record verbatim reaction (e.g., "That's cheap!" / "A bit high" / "Perfect")

Follow-up if negative:
- **"What would be a better price for you?"**
  - Record floor price (minimum they'd accept)

Follow-up if positive:
- **"Would you pay more if we added [feature X]?"**
  - Test feature willingness to pay (optional, for roadmap)

### Question Set 3: Competitive Comparison

**"Right now you pay [฿X] per month for [current platform]. Our tier would cost you [฿Y]. How does that compare?"**

- Record: Cost reduction percentage
- E.g., "SiKram Starter = 1,890฿. FaceLink PROFESSIONAL = 450฿. That's 76% cheaper."

**"Would that level of savings convince you to try FaceLink?"**
- Record: YES / NO / MAYBE
- If MAYBE: "What would make it a YES?"

### Question Set 4: All Features Check

**"One important thing: Everything is included at every tier. No feature gating — LINE, search, branding, storage, all included from 150฿ onwards. How does that compare to what you're getting now?"**

- Record: Reaction to feature completeness
- (This is major differentiator vs SiKram/Pixid)

---

## Part 3: Feature Gaps & Must-Haves (5 min)

**Goal:** Identify if we're missing critical features

### Questions

**"Looking at the core features — photo upload, AI face search, LINE messaging, web download, storage — is there anything critical missing?"**

- Listen for: Video, analytics, prints, photobooth integration, team collaboration, white-labeling, etc.
- Record: Requested feature + importance (critical / nice-to-have / not needed)

**"Do you need any of these?"**
- Team collaboration (multiple photographers upload to same event)
- Analytics (download/view statistics)
- Print integration (order prints directly)
- White-label / branding
- API integration (connect to studio software)

Record: Feature + [critical/nice/not needed] for each

---

## Part 4: Switching Intent Confirmation (3 min)

**"If we launched today with this pricing and these features, would you try it?"**
- Record: YES / NO / MAYBE

If NO: "What would make you try it?"
If MAYBE: "What's your hesitation?"

**"Would you recommend FaceLink to other photographers?"**
- Record: Likely to refer? YES / NO / MAYBE

---

## Part 5: Usage & Behavior (Optional, 2 min)

**Goal:** Inform product roadmap and MVP scope

### Questions

**"When you're at an event, how do you distribute photos? Is LINE important or do photographers use the web?"**
- Record: Preference (LINE / Web / Both)

**"How quickly do participants download? Same day? Week later?"**
- Record: Timeline for MVP scope (real-time or batch is fine)

**"How many participants at a typical event?"**
- Record: Participant count (informs LINE messaging volume)

---

## Interview Data Collection Template

Create one of these per interview:

```markdown
## Interview [#1]

**Date:** [date]
**Interviewer:** [name]
**Duration:** [minutes]

### Interviewee Profile
- **Name:** [optional]
- **Current Platform:** [Pixid / SiKram / MangoMango]
- **Experience:** [years using platform]
- **Events/month:** [number]
- **Photos/month:** [estimate]
- **Monthly Spend:** [฿amount]

### Current Platform Sentiment
- **Likes:** [list]
- **Frustrations:** [list]
- **Pain Score (1-10):** [number] (10 = very frustrated)

### Pricing Reaction
- **Selected Tier:** [STARTER / PROFESSIONAL / STUDIO]
- **Gut Reaction:** [quote]
- **Acceptable Price Range:** ฿[min] - ฿[max]
- **Cost Savings (vs current):** [%]

### Switching Intent
- **Would try FaceLink:** YES / NO / MAYBE [reason]
- **Would recommend:** YES / NO / MAYBE

### Feature Gaps
- **Critical Missing:** [list or None]
- **Nice-to-Have:** [list]
- **Not Needed:** [list]

### Behavioral Insights
- **Prefers:** [LINE / Web / Both]
- **Download Timeline:** [same day / within week / later]
- **Typical Event Size:** [participants]

### Key Quote
> "[Most memorable feedback from interview]"

### Next Steps
- [ ] Send thank-you + offer (discount / free credit)
- [ ] Follow-up in 2 weeks (ask if MVP launched, would they sign up)
```

---

## Analysis & Decision Framework

### Success Criteria (Pricing Validation Passes If)

**✅ Metric 1: Price Acceptance**
- 80%+ of interviewees find their selected tier "acceptable" or "good value"
- No one says prices are "too high"
- Average acceptable range includes our proposed prices

**✅ Metric 2: Tier Accuracy**
- Photographers select tiers matching their usage (few mismatches)
- No tier is "too expensive" relative to others

**✅ Metric 3: Switching Intent at Price**
- 70%+ would try FaceLink at proposed pricing
- Savings (vs current platform) is mentioned as major factor
- No one rejects based on price alone

**✅ Metric 4: Feature Completeness**
- No critical missing features reported (0 "must-haves")
- Feature parity with competitors confirmed
- All-features-included positioning validated

### Analysis by Segment

**For STARTER tier:**
- Acceptable to casual photographers? YES / NO
- Average price: ฿150 acceptable? [record feedback]

**For PROFESSIONAL tier:**
- Acceptable to regular photographers (4-6 events/mo)? YES / NO
- Cost savings compelling vs SiKram Starter (1,890฿)? YES / NO
- 450฿ price point right? YES / LOW / HIGH

**For STUDIO tier:**
- Acceptable to high-volume photographers (10+ events/mo)? YES / NO
- Cost savings compelling vs SiKram Premium (3,990฿)? YES / NO
- 1,000฿ price point right? YES / LOW / HIGH

### Red Flags (Price Validation FAILS)

**❌ Metric 1: Price Rejection**
- <70% would switch at proposed prices
- Common feedback: "Too high" or "Unclear value"
- Multiple photographers want lower prices (floor prices much lower)

**❌ Metric 2: Tier Mismatch**
- Photographers consistently select "wrong" tier for their usage
- Price jumps between tiers feel too large or too small
- No clear separation between tier utilities

**❌ Metric 3: Feature Gaps**
- Multiple photographers request critical features we didn't plan
- Switching intent drops due to missing features (not price)
- Feature parity question: "Why should I switch if you don't have [X]?"

**❌ Metric 4: Price Sensitivity**
- Switching intent only if price cut >30%
- Competitors' pricing undercuts ours despite our 47-82% claimed advantage
- Willingness-to-pay is much lower than our proposed model

---

## Decision Logic

### If Validation PASSES ✅

**Decision:** Proceed to MVP (Phase 6)
- Pricing model is validated
- No critical feature gaps
- Switching intent confirmed
- Proceed with confidence

**Next:** 6_mvp_scope.md → Build MVP

---

### If Validation FAILS on Pricing ❌

**Decision:** Adjust pricing or pivot

**Options:**
1. **Lower entry price** (e.g., 100฿ instead of 150฿)
   - May compress margins, but increases adoption
   - Test: Re-interview with new prices

2. **Restructure tiers** (e.g., more granular: 100/200/400/800฿)
   - Reduce decision paralysis
   - Better tier matching
   - Test: Re-interview with new structure

3. **Increase value** (add features to justify price)
   - E.g., analytics, team collab, white-labeling
   - Expensive but differentiates
   - Test: Re-interview with feature list

---

### If Validation FAILS on Features ❌

**Decision:** Expand MVP scope or refocus

**Options:**
1. **Add missing feature to MVP** (if small scope)
   - E.g., if analytics is critical, add basic stats

2. **Add to Roadmap, not MVP** (if large scope)
   - Launch without it, add in v1.1
   - Communicate: "On our roadmap"

3. **Reconsider product vision** (if major disconnect)
   - Validate again that we're solving right problem
   - May need upstream (0_initial_concept.md) update

---

## Timeline & Execution

### Week 1: Interview Setup
- Recruit 5-10 photographers (from waitlist, direct outreach, Facebook)
- Schedule calls/meetings

### Week 2-3: Conduct Interviews
- Execute 5-10 interviews
- Take detailed notes per template
- Record sentiment (with permission)

### Week 4: Analysis & Decision
- Aggregate data across all interviews
- Run decision logic above
- Document in summary report
- Decide: PROCEED / ADJUST / PIVOT

---

## Interview Recruitment Tips

### Where to Find Photographers

1. **From demand validation waitlist** (best option — they've already expressed interest)
2. **Facebook photography groups** (join + DM active members)
3. **Instagram hashtags** (#คนถ่ายรูป #ถ่ายภาพงาน #พ่อแม่พาลูก)
4. **Direct competitors' reviews** (Pixid/SiKram Google reviews → contact dissatisfied users)
5. **Referrals** (ask interviewed photographers to refer colleagues)

### Incentive to Participate

- Option 1: "Help shape a new product" (appeal to early-adopter ego)
- Option 2: Free ฿100 credit on FaceLink when it launches
- Option 3: Starbucks/Dunkin gift card (฿200-300 value)
- Option 4: Entry into raffle for ฿1,000 credit bundle

### Interview Scheduling

- Ask availability (most photographers: evenings / weekends)
- Send Zoom link + question preview beforehand
- Reminder 24 hours before
- Keep to 20-30 minutes (respect their time)

---

## Report Template (Aggregate)

Create final report summarizing:

**Executive Summary:**
- [number] interviews completed
- Validation status: PASS / FAIL / CONDITIONAL
- Recommendation: PROCEED / ADJUST / PIVOT

**Pricing Feedback:**
- % who find prices acceptable: [X%]
- Tier accuracy: [Y% selected correctly]
- Switching intent at price: [Z%]
- Average price reduction vs current: [฿X or Y%]

**Feature Gaps:**
- Critical missing: [list or None]
- Nice-to-have: [list]

**Quotes:**
- [2-3 most memorable quotes supporting recommendation]

**Next Steps:**
- If PROCEED: Schedule MVP kickoff
- If ADJUST: Document price adjustments tested
- If PIVOT: Document what failed + recommendations

---

## Gate: Phase 5 Complete

**Question:** Should we proceed to MVP with our pricing and feature plan?

**Passes if:** 70%+ switching intent at proposed prices + no critical feature gaps

**Next step:** Phase 6 (6_mvp_scope.md, 6_technical_architecture_detailed.md, 6_go_to_market.md)

---

**Status:** Ready to execute Phase 5

**Last Updated:** 2025-12-02
