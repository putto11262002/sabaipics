---
title: Competitor Feature Deep Dive
description: Hands-on exploration of competitor products from user perspective. Documents observed features, workflows, friction points, and magic moments.
---

# Competitor Feature Deep Dive

## Photographer Experience

### Features Observed

| Feature | Pixid | SiKram | MangoMango | Notes |
|---------|-------|--------|------------|-------|
| **Upload Methods** | | | | |
| Web upload | Yes - drag-and-drop | Yes | Yes | Pixid warning: doesn't support LINE Auto |
| Desktop app | Yes - v0.4.14 (Win/Mac Intel/Mac Silicon) | Yes - Fast Sync (Win/Mac) | No | SiKram: zero-setup |
| FTP upload | Yes - in-camera FTP (Nikon Z8/Z9) | Yes - Cloud Sync FTP | No | |
| Lightroom plugin | Yes - v0.1.0-beta7 | Yes - AI auto-editing + presets | No | |
| Bot upload | No | No | Yes - automated via bot ID | Unique to MangoMango |
| **Camera Integration** | | | | |
| Canon | Yes - EOS Utility integration | Not documented | Not documented | |
| Nikon | Yes - NX Mobile Air, FTP | Not documented | Not documented | |
| Sony | Yes - Image Edge Desktop, T&T app | Not documented | Not documented | |
| Universal (PhotoSync) | Yes | Yes (via Cloud Connect) | Not documented | |
| **Photo Processing** | | | | |
| AI face recognition | Yes - toggle in settings | Yes - 99.5% accuracy claimed | Yes (implied by selfie matching) | |
| AI quality filter | No | Yes - Pic Guard (blurry/closed-eye) | No | Auto-curation |
| LUT color grading | Yes - upload custom LUTs | No | No | Pixid only |
| Photo adjustments | Yes - exposure, contrast, saturation, RGB | Yes - via Lightroom presets | No | |
| Templates/frames | Yes - horizontal/vertical presets | Yes - watermark/frame (Premium) | Yes - frames & logo | |
| **Gallery/Delivery** | | | | |
| QR code generation | Yes - instant per project | Yes | Not observed | |
| Gallery themes | Yes - 4 presets (Midnight, Cube, Gatsby, Sunrise) | Yes (Premium) | Not observed | |
| Branding | Yes - logo, text overlay, frames | Yes - theme colors, logo (Premium) | Yes - photo frames & logo | |
| Multi-language | Yes - Thai, English, Chinese, Lao | Yes - Thai, English, Chinese, Lao | Yes - Thai, English, Japanese | Japanese unique |
| LINE integration | Yes - LINE OA fields in settings | Yes - LINE OA + LIFF (Premium) | Yes - bot integration | Different approach |
| **Platform** | | | | |
| Pricing model | Subscription tiers | Credit-based tiers | Photo quota packages | MangoMango: S/M/L/XL |
| Storage (free) | 200 MB / 200 photos | Trial limited | 100 credits (photos) | |
| Multi-currency | No (THB only observed) | No (THB only observed) | Yes - THB/USD | International |
| Credit transfer | No | No | Yes - via phone number | Team collaboration |
| Discount codes | Not observed | Not observed | Yes | Promo system |
| **Unique Features** | | | | |
| Photobooth integration | No | Yes - built into Fast Sync | No | |
| Face Capture Mode | No | Yes - mobile guest camera | Yes - selfie submission | |
| Photo sales | No | Yes - with Sales Report analytics | No | SiKram: 10% fee |
| Print fulfillment | No | Yes (Premium) | No | |
| Multi-photographer | Not observed | Not observed | Yes - invite to album | Team coverage |
| Broadcast messaging | No | No | Yes - welcome + broadcast | Communication |
| Transaction history | No | No | Yes - with export | Credit tracking |

### Friction Points

| Competitor | Friction | Where |
|------------|----------|-------|
| Pixid | Free tier very limited - no AI, no LINE Auto, 200MB cap | Account limits |
| Pixid | Web uploader "doesn't support LINE Auto" warning | Upload interface |
| Pixid | FTP setup requires technical knowledge | Camera configuration |
| Pixid | Different setup per camera brand (Canon/Nikon/Sony) | Onboarding |
| Pixid | Need specific cables (data, not charging) - signal drops otherwise | Hardware setup |
| Pixid | Device locking - new login kicks old device out | Multi-device |
| Pixid | Mixed Thai/English interface | UI consistency |
| Pixid | Sony cameras need workaround for Lightroom tethering | Camera compatibility |
| Pixid | Lightroom plugin needs manual folder monitoring stop | Workflow |
| SiKram | Trial blocks core functionality - "Cannot upload photos" alert | Account limits |
| SiKram | Premium walls on themes, watermarks, LINE OA, print, sales | Feature gating |
| SiKram | Long event creation form - multiple sections | Onboarding |
| SiKram | 4 different sync methods creates decision fatigue | Cloud Settings |
| SiKram | Mountain Duck + FTP need technical knowledge | Setup complexity |
| SiKram | Profile completion pressure (17% score displayed) | UX pressure |
| SiKram | Mixed Thai/English interface | UI consistency |
| SiKram | No help docs or demo data during exploration | Empty states |
| MangoMango | Credit anxiety - prominent quota display (100 remaining) | Dashboard |
| MangoMango | 4 package tiers with attendee estimates - overwhelming | Buy Package |
| MangoMango | No clear trial info - what can you test free? | Onboarding |
| MangoMango | UI bugs - create album dialog appeared twice | Stability |
| MangoMango | Many empty states make evaluation difficult | Empty states |
| MangoMango | Upload workflow unclear from dashboard | Upload flow |
| MangoMango | Mixed Thai/English terms | UI consistency |

### Magic Moments

| Competitor | What Works Well | Where |
|------------|----------------|-------|
| Pixid | Instant QR code + gallery link on project creation | Projects |
| Pixid | Real-time LUT/adjustment preview before applying | Editing |
| Pixid | Photos appear in gallery during tethered shooting | Live events |
| Pixid | Save adjustments/LUTs/frames as reusable templates | Workflow efficiency |
| Pixid | Camera-specific tutorials show deep expertise | Tutorials section |
| Pixid | Cross-platform support (Win/Mac Intel/Mac Silicon) | Desktop app |
| Pixid | 2000px recommendation balances quality + mobile speed | Smart defaults |
| Pixid | Professional FTP monitoring with analytics | Upload logs |
| SiKram | Fast Sync "login and use immediately" - zero setup | Desktop app |
| SiKram | Pic Guard auto-removes blurry/poor photos | AI curation |
| SiKram | Face recognition search in file manager | Photo discovery |
| SiKram | Built-in photobooth in desktop app | Value-add revenue |
| SiKram | All-in-one: capture → edit → sales → print | Platform completeness |
| SiKram | Lightroom AI auto-editing with scheduled processing | Automation |
| SiKram | Social media profile linking for credibility | Photographer marketing |
| SiKram | 99.5% face recognition accuracy claim | Marketing |
| SiKram | 80% attendee photo sharing rate claim | Viral potential |
| MangoMango | Simple album creation - just name + language | Onboarding |
| MangoMango | Native multi-language (Thai/English/Japanese) | Localization |
| MangoMango | Credit transfer via phone number | Team collaboration |
| MangoMango | Bot integration for automated uploads | Automation |
| MangoMango | Real-time stats (photos, participants, delivery) | Analytics |
| MangoMango | Multi-photographer collaboration on albums | Team coverage |
| MangoMango | VAT transparency in pricing | Trust |
| MangoMango | Search + year/month filter for albums | Organization |
| MangoMango | Friendly empty state illustrations | UX polish |

---

## Participant Experience

### Features Observed

| Feature | Pixid | SiKram | MangoMango | Notes |
|---------|-------|--------|------------|-------|
| Photo discovery | QR code → gallery | QR code → gallery | Not observed | |
| Face search | AI-powered (paid tiers) | AI-powered (99.5% claimed) | AI-powered (implied) | |
| Download - Android | Direct download button | Not observed | Not observed | |
| Download - iPhone | Long press → save | Not observed | Not observed | |
| Personal QR codes | Yes - per selected photos | Not observed | Not observed | |
| App required | No - web gallery | No - web gallery | Not observed | |
| Social login | Not observed | Google, LINE, Facebook | Not observed | |
| Face Capture (selfie) | No | Yes - guest camera mode | Yes - selfie submission | Stats show "selfies submitted" |
| Photo purchase | No | Yes - buy/download photos | No | SiKram: 10% platform fee |
| Delivery tracking | Not observed | Not observed | Yes - "photos sent" stat | Real-time |

### Friction Points

| Competitor | Friction | Where |
|------------|----------|-------|
| Pixid | iPhone download requires long-press (not intuitive) | Download flow |
| Pixid | AI face search only on paid tiers | Photo discovery |
| SiKram | Download flow not observed in dashboard exploration | Unknown UX |
| MangoMango | Participant experience not directly observed | Dashboard-only view |

### Magic Moments

| Competitor | What Works Well | Where |
|------------|----------------|-------|
| Pixid | No app download required - just scan QR | Gallery access |
| Pixid | Personal QR codes for individual photos | Sharing |
| SiKram | No app download required - web gallery | Gallery access |
| SiKram | Multiple social login options (Google, LINE, FB) | Easy access |
| SiKram | Face Capture lets attendees take own photos | Self-service |
| SiKram | 80% attendee sharing rate claimed | Viral potential |
| MangoMango | Selfie submission for matching | Self-service discovery |
| MangoMango | Real-time delivery tracking visible to organizer | Transparency |

---

## Corrections from Phase 1

| Item | 1_competitive_landscape said | Actually observed |
|------|------------------------------|-------------------|
| SiKram AI accuracy | 99% accuracy | 99.5% accuracy claimed (Shark Tank video) |
| SiKram desktop app | "Cloud Desktop (beta)" | "Fast Sync" - zero-setup, login-and-use (polished) |
| SiKram Eye-closed Detection | Only Pixid has this | SiKram has "Pic Guard" - blurry + closed-eye filter |
| SiKram Video Face Search | Listed as differentiator | Not observed in dashboard exploration |
| Pixid desktop app | Not explicitly mentioned | Has dedicated desktop uploader v0.4.14 |
| MangoMango WhatsApp | "LINE + WhatsApp" | Only LINE (bot) observed - WhatsApp not found |
| MangoMango languages | Not mentioned | Thai, English, Japanese (unexpected Japanese) |
| MangoMango credit transfer | Not mentioned | Phone-based credit transfer for team collaboration |
| MangoMango bot integration | Not mentioned | Automated upload via bot ID assignment |

**Note:** Some Phase 1 items may be accurate but not observable in dashboard exploration (e.g., Video Face Search may require active event with video uploads).

---

## Gate Assessment

**Gate Question:** Do we understand features from the USER PERSPECTIVE?

**Passing Criteria:**
- [x] Pixid dashboard fully explored
- [x] SiKram dashboard fully explored
- [x] MangoMango dashboard fully explored
- [x] Complete feature inventory documented
- [x] Observations (friction/magic) for each
- [x] Cross-check with Phase 1 complete

**Answer: YES** [GATE PASSED]

---

*Status: COMPLETE - Ready to proceed to [2_feature_positioning.md]*
