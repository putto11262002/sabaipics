# Landing Page Optimization Checklist

## 1. Images
- [x] Hero camera images - are they `priority` or lazy loaded? → **✅ `priority` set correctly**
- [x] Feature section illustrations - should lazy load (below fold) → **✅ Already lazy loading (no priority)**
- [x] iOS app section images - should lazy load → **✅ Already lazy loading**
- [x] Logo icons in footer - should lazy load → **N/A (using Lucide icons, not images)**

**Result: ⭐ Excellent - No changes needed. All images follow best practices.**

## 2. Rendering Strategy
- [x] What's the current SSR/SSG/ISR setup? → **✅ Fully SSG (Static Site Generation)**
- [x] Are pages static or dynamically rendered? → **✅ All pages pre-rendered at build time**
- [x] Can we use ISR with revalidation? → **Not needed - redeploy invalidates cache automatically**

**Result: ⭐ Excellent - SSG is optimal for landing page. No ISR needed since redeploy handles cache invalidation.**

## 3. Client Components
- [x] Which components have `'use client'` at the top? → **Audited all 17 components**
- [x] Can we push `'use client'` down to leaf components? → **Converted 4 static sections to server components**
- [x] Are animations forcing entire sections to be client-side? → **Yes, Framer Motion sections must stay client (acceptable)**

**Converted to Server Components (4):**
- ✅ `pricing-section.tsx` - CSS-only effects, translations → server
- ✅ `faq-section.tsx` - Static content, translations → server
- ✅ `footer.tsx` - Static content, translations → server
- ✅ `ios-app-section.tsx` - Static content, translations → server

**Remaining Client Components (13) - Analyzed by Complexity:**

| Component | Reason | Refactor Complexity |
|-----------|--------|---------------------|
| `hero.tsx` | Framer Motion + translations | 🟡 Medium - could extract gradient |
| `hero-event-stage.tsx` | Framer Motion + animation state | 🔴 High - section-level, leave as-is |
| `hero-event-stage.fixed.tsx` | Framer Motion + animation state | 🔴 High - unused? consider removing |
| `hero-event-reel.tsx` | Framer Motion + animation state | 🔴 High - section-level, leave as-is |
| `feature-story.tsx` | Framer Motion + scroll animations | 🔴 High - section-level, leave as-is |
| `upload-way-section.tsx` | Scroll handlers + intersection observer | 🔴 High - section-level, leave as-is |
| `upload-camera-stage.tsx` | Framer Motion + animations | 🔴 High - section-level, leave as-is |
| `bento-features.tsx` | useState for message rotation | 🟢 Low - could extract |
| `site-nav.tsx` | Mobile menu state + scroll listener | 🟡 Medium - could extract menu |
| `site-nav-auth-cta.tsx` | Auth state | 🟢 Low - minimal, leave as-is |
| `www-auth-provider.tsx` | Auth provider wrapper | 🟢 Low - must be client |
| `camera-compatibility-content.tsx` | Tab state | 🟢 Low - could extract |
| `camera-guide-entry.tsx` | Form state | 🟡 Medium - could extract |

**Result: Reduced from 17 → 13 client components. Framer Motion sections are acceptable at section-level.**

## 4. Dynamic Content
- [x] What's actually dynamic on the landing page? → **Nothing - all static content**
- [x] Can we pre-render everything and only hydrate interactive parts? → **Already doing this - SSG for all pages**

**Result: ⭐ Excellent - No dynamic content. All pages are fully pre-rendered at build time.**

## 5. Caching (Cloudflare)
- [x] Cache headers for static assets → **✅ Added `public/_headers`**
- [x] Cache headers for HTML pages → **✅ Cloudflare default (max-age=0, must-revalidate)**
- [x] Edge caching configuration → **✅ Automatic via Cloudflare CDN**
- [x] Font loading strategy → **✅ Immutable cache for fonts**

**Result: ⭐ Excellent - Caching configured via `public/_headers` with immutable rules for static assets.**

**Cache Strategy:**
- `/_next/static/*` → 1 year, immutable (hashed filenames)
- `/images/*`, `/badges/*`, `/landing/*`, `/guides/*` → 1 day + stale-while-revalidate
- `/fonts/*` → 1 year, immutable
- HTML pages → Cloudflare default (revalidate on each request)

## 6. Bundle Size

**Build Analysis (1.6 MB JS / 2.1 MB static total):**

| Chunk | Size | Contents |
|-------|------|----------|
| `9a0003f898c57a90.js` | 224 KB | Next.js runtime (unavoidable) |
| `b76b6aba1224068e.js` | 195 KB | **Framer Motion** - animation library |
| `432bfbb987066c98.js` | 153 KB | Core deps (React, etc.) |
| `bd7c486861bbabaa.js` | 138 KB | **next-intl** - i18n library |
| `a6dad97d9634a72d.js` | 113 KB | Polyfills (browser support) |
| `b4209fe139ea86ef.js` | 88 KB | Additional deps |
| Page chunks (×3) | 51 KB each | Landing, compatibility, guides |
| `41f037834a236918.css` | 266 KB | Tailwind + custom styles |

**HTML Pages (pre-rendered):**
- Thai landing: 207 KB
- English landing: 195 KB
- Other pages: 64-94 KB each

- [x] Is Framer Motion being tree-shaken? → **✅ Yes - single 195KB chunk**
- [x] Are there heavy dependencies we can reduce? → **No - Framer Motion + next-intl are necessary**
- [x] Code splitting per section? → **✅ Yes - pages have separate chunks**

**Result: ⭐ Good - Sizes are reasonable for a marketing site with animations and i18n.**

## 7. Core Web Vitals

**Current Optimizations:**
- [x] LCP (Largest Contentful Paint) - hero image → **✅ `priority` set on hero images**
- [x] CLS (Cumulative Layout Shift) - image placeholders → **✅ Using `sizes` prop + fixed dimensions**
- [x] FID/INP (Interactivity) → **Acceptable - Framer Motion loads async**

**Recommendations for Production Testing:**
- Run Lighthouse audit after deploy
- Monitor Real User Metrics (RUM) via Cloudflare Web Analytics
- Target: LCP < 2.5s, CLS < 0.1, INP < 200ms

**Result: ⭐ Good - All known optimizations applied. Needs production testing.**

## 8. Bundle Analysis (Deep Dive)
- [ ] Add `@next/bundle-analyzer` for detailed breakdown
- [ ] Analyze what's in each chunk
- [ ] Identify opportunities for further optimization

**Status: Deferred - Current bundle analysis (#6) is sufficient for now.**

---

## Summary

| # | Item | Status | Impact |
|---|------|--------|--------|
| 1 | Images | ✅ Excellent | No changes needed |
| 2 | Rendering Strategy | ✅ Excellent | SSG optimal |
| 3 | Client Components | ✅ Improved | 17 → 13 client components |
| 4 | Dynamic Content | ✅ Excellent | All static |
| 5 | Caching | ✅ Configured | `_headers` added |
| 6 | Bundle Size | ✅ Good | 1.6MB reasonable for animations |
| 7 | Core Web Vitals | ✅ Optimized | Needs prod testing |
| 8 | Deep Bundle Analysis | ⏸️ Deferred | Low priority |

**Next Steps:**
1. Deploy and run Lighthouse audit
2. Set up Cloudflare Web Analytics for RUM
3. Monitor Core Web Vitals in production
