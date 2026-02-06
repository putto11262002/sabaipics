Title: Landing Page Content Sections (Draft)
Date: 2026-02-02

Notes

- This is a content/module proposal for a one-page public website (scroll-to sections).
- Not a final design. Avoid locking layout/visuals too early.

Goal

- Keep the page to 4-5 sections while clearly communicating: easy UI/UX, upload flexibility, reliability, and pay-as-you-go affordability.

Proposed 4-5 sections (raw)

1. Hero

- Core promise (deliver event photos effortlessly)
- Primary CTA (start free trial)
- Optional one-line micro-flow: shoot/edit -> upload -> share/download

2. High-level capabilities

- A compact list of key capabilities (can later become a bento-style block)
- Must cover: upload flexibility, attendee discovery (face search), sharing (QR/LINE), branding/watermark, organizer readiness

3. Upload ingestion (explicit)

- Explicitly list the 4 ways to get photos into SabaiPics
  - iOS app + camera WiFi connection
  - Browser upload
  - Desktop uploader
  - Lightroom auto-export plugin
- Rationale: this is a core differentiator and directly addresses common objections (uploading is annoying; workflow fit)

4. Pricing + trial

- Pay-as-you-go framing
- Trial definition: credit-based trial with 1000 photos/credits
- Keep claims concrete and calm (avoid cheap/discount vibes)

5. FAQ

- Camera compatibility (major brands; link to compatibility list)
- Setup/onboarding (only claim "plug-and-play" if true)
- Privacy (brief answer + link to detailed policy)
- Face search accuracy (if claiming a % range, ensure it is defensible)
- LINE delivery (use wording that matches actual capability)

What to avoid (for now)

- A dedicated "How it works" section (use a one-line micro-flow instead to stay within 4-5 sections)
- A dedicated "Event types" section (can be a supporting line or small callout later)
- Over-technical explanations (infra/AI implementation details)

Open items to confirm before final copy

- LINE claim scope (share links vs bot sends links vs bot sends photos)
- Defensible face search accuracy range (if we publish 98-99% publicly)
- Exact meaning of 1000 trial credits (what actions consume credits)

Implementation notes (current state)

- Hero includes a centered "camera stage" showcase under the hero copy.
- Camera stage uses shadcn semantic tokens for all surfaces/borders (no hardcoded hex colors).
- Capture animation: shutter closes briefly, image swaps while dark, then reopens.
- Camera stage cycles between placeholder event images.

Where to find the current implementation

- Hero: `apps/www/components/landing/hero.tsx`
- Camera stage: `apps/www/components/landing/hero-event-stage.tsx`
- Placeholder images: `apps/www/public/landing/i.png`, `apps/www/public/landing/ii.png`

Hero messaging tweak (current)

- Eyebrow replaced with a badge: "Free trial includes 1000 image uploads"
