# Research: LINE Integration Options

**Status:** TODO
**Scope:** Discover and explore ALL options LINE offers for business/app integration (not decision-making)

---

## Context

We're building an event photo distribution platform for Thailand market. Participants scan QR at events, submit selfie for face matching, and receive their photos.

**Business context:**
- Thailand market = LINE is dominant messaging app
- Competitors use LINE integration (table stakes)
- Fast-follower strategy
- UX is key differentiator

**Core flow we need to enable:**
1. Participant scans QR at event
2. Opens some interface
3. Takes/uploads selfie
4. Sees matched photos
5. Downloads photos
6. Gets notified when new photos available

**Design drivers:**
1. Fast experience (minimal friction)
2. LINE-native (Thai market expectation)
3. High velocity dev

---

## Requirements

- **Camera/selfie access:** Must be able to capture selfie
- **Photo display:** Show gallery of matched photos
- **Download:** Allow saving photos to device
- **Push notifications:** Alert when new photos ready
- **No app install:** Friction killer
- **Deep linking:** QR → specific event

---

## Scale Parameters

| Tier | Participants/month |
|------|-------------------|
| Tier 1 | 1,000 |
| Tier 2 | 15,000 |
| Tier 3 | 100,000 |

**Exchange rate:** 1 USD = 31.96 THB

---

## Categories to Explore

Explore ALL ways LINE allows businesses/applications to integrate:

| Category | Explore |
|----------|---------|
| LINE Frontend Framework (LIFF) | |
| LINE Mini App | |
| LINE Official Account (OA) | |
| LINE Messaging API | |
| LINE Login | |
| LINE Notify | |
| LINE Bot | |
| Rich menus / Flex messages | |
| Any other LINE platform features | |

---

## Solutions Found

| Solution | Category | Notes |
|----------|----------|-------|
| | | |

---

## For Each Solution, Capture

### What is it?
- What does this LINE feature/product do?
- What's it designed for?

### Capabilities
- Can it access device camera?
- Can it display web content?
- Can it send push notifications?
- Can it handle deep links?
- Full screen UI possible?
- Offline support?

### Limitations
- What CAN'T it do?
- Size/performance constraints
- API restrictions
- Platform rules/policies

### Cost
- Pricing tiers
- Message costs
- Any platform fees
- Free tier limits

### Developer Experience
- SDK/API quality
- Documentation
- Testing/debugging tools

### Use Cases
- What are others using it for?
- What do competitors use?

---

## Integration Considerations

| Connects To | Think About |
|-------------|-------------|
| **API Backend** | Authentication, user identity |
| **Face Capture flow** | Camera access |
| **Notifications** | How to push "your photos are ready" |
| **Gallery display** | Photo loading, performance |
| **QR code flow** | Deep link into correct event |

---

## Key Questions to Answer

- What are ALL the ways to integrate with LINE?
- Which options allow camera access?
- How do push notifications work on each option? Cost?
- What are competitors (Pixid, SiKram) doing with LINE?
- Can we combine multiple LINE features? (e.g., OA + something else)
- What's the friction level for each option from user perspective?

---

## Competitor Intelligence

What LINE integration do competitors use?

| Competitor | LINE Integration | Notes |
|------------|------------------|-------|
| Pixid | | "LINE Auto" feature |
| SiKram | | LINE OA mentioned |

---

## Open Questions

*Capture questions that arise during research*

