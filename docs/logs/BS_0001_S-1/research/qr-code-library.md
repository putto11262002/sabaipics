# QR Code Library Research

Execution root: `BS_0001_S-1`
Research topic: `qr-code-library`
Date: `2026-01-09`
Blocking: Yes (US-5, US-6)

---

## 1. Decision Frame

### What we need to decide
Select a QR code generation library for server-side QR code generation in Cloudflare Workers, producing downloadable PNG files stored in R2.

### Constraints
- **Runtime:** Cloudflare Workers (edge runtime, not Node.js)
- **Node.js compat:** `nodejs_compat` flag enabled in wrangler.jsonc
- **Output format:** PNG (for download and print compatibility)
- **Storage:** R2 bucket (`PHOTOS_BUCKET` already configured)
- **URL pattern:** `https://sabaipics.com/search/{accessCode}`
- **URL length:** ~35-50 characters (well within QR capacity of 4,296 chars)
- **Worker size limit:** 10 MB compressed (paid plan), 3 MB (free plan)
- **Memory limit:** 128 MB per isolate

### Quality requirements
1. **Scannable:** QR code must be reliably scannable by mobile cameras
2. **Printable:** PNG output for physical printing (event materials, cards)
3. **Downloadable:** User can download QR as PNG from dashboard
4. **Fast generation:** < 100ms latency acceptable (event creation is infrequent)

---

## 2. Repo-First Grounding

### Existing patterns
- **No QR code library** currently in `apps/api/package.json`
- **No image generation** libraries currently used
- **R2 bucket** already configured for photo storage
- **Rekognition integration** exists but uses AWS SDK (not relevant here)
- **Prior research** found in `.claude.bak/_logs/S1/research/qr-code-generation.md` recommending `@juit/qrcode`

### Tech stack alignment
- Hono API framework (compatible with any pure JS library)
- Zod validation (can validate QR options)
- TypeScript (prefer typed libraries)

---

## 3. Gap Analysis

### Must-know (blocking)
- [x] Which libraries work on Workers without Canvas/Node.js APIs?
- [x] Can PNG be generated without native dependencies?
- [x] What are the bundle size implications?
- [x] Is the recommended library still maintained?

### Nice-to-know (non-blocking)
- [x] SVG vs PNG tradeoffs for mobile scanning
- [ ] Exact bundle size of each option (bundlephobia unavailable)
- [ ] Performance benchmarks on Workers

---

## 4. Evidence Summary

### Tier A: Workers-Compatible Libraries Identified

| Library | Workers OK | Output Formats | Dependencies | Maintenance |
|---------|-----------|----------------|--------------|-------------|
| **@juit/qrcode** | Yes (explicit) | PNG, SVG, PDF | 0 | Active (v1.0.77) |
| **uqr** | Yes | SVG, ANSI, Unicode | 0 | Active |
| **qrcode-svg** | Yes | SVG only | 0 | Stable (v1.1.0) |
| qrcode (node-qrcode) | No | N/A | Canvas API | - |
| qr-image | No | N/A | Node.js | - |

### Tier B: Library Details

#### @juit/qrcode (v1.0.77)
- **Source:** https://github.com/juitnow/juit-qrcode
- **NPM:** https://www.npmjs.com/package/@juit/qrcode
- **Workers support:** Explicitly stated: "suitable for inclusion in runtimes like Cloudflare Workers"
- **PNG mechanism:** Uses `CompressionStream` (web standard) for deflate compression
- **API:** `generatePngQrCode(message, options)` returns `Promise<Uint8Array>`
- **TypeScript:** Full type definitions included
- **Tree-shakable:** Individual exports for each format
- **Inspiration:** Based on `qr-image` (Alexey Ten), rewritten for modern web standards

#### uqr (v0.1.2)
- **Source:** https://github.com/unjs/uqr
- **NPM:** https://www.npmjs.com/package/uqr
- **Maintainer:** UnJS (same org as Nitro, Nuxt ecosystem)
- **Workers support:** ES module, zero deps, designed for any runtime
- **PNG support:** No (SVG, ANSI, Unicode only)
- **API:** `renderSVG(text, options)` returns `string`
- **TypeScript:** Full type definitions

#### qrcode-svg (v1.1.0)
- **Source:** https://github.com/nickshanks/qrcode-svg
- **NPM:** https://www.npmjs.com/package/qrcode-svg
- **Workers support:** Pure JS, no dependencies
- **PNG support:** No (SVG only)
- **API:** `new QRCode(options).svg()` returns `string`

### Tier C: PNG vs SVG Considerations

| Factor | PNG | SVG |
|--------|-----|-----|
| Mobile scanning | Universal | Universal |
| Print quality | Fixed DPI (needs high-res) | Infinite scaling |
| File size | ~1-5 KB typical | ~1-3 KB typical |
| Browser support | Universal | Universal |
| Download UX | Direct image | May need conversion |
| Workers generation | Needs library (deflate) | Easy (string output) |

**Key insight:** Both PNG and SVG are equally scannable by mobile cameras. The choice is primarily about:
1. **User expectation:** PNG is more universally understood as "image download"
2. **Print workflow:** Photographers may prefer PNG for immediate use
3. **Generation complexity:** SVG is simpler (no compression needed)

---

## 5. Options

### Option A: @juit/qrcode (PNG native)
**Approach:** Use `@juit/qrcode` for direct PNG generation on Workers.

**Implementation:**
```typescript
import { generatePngQrCode } from "@juit/qrcode";

const pngBytes = await generatePngQrCode(
  `https://sabaipics.com/search/${accessCode}`,
  { ecLevel: "M", margin: 4 }
);
await env.PHOTOS_BUCKET.put(`qr/${eventId}.png`, pngBytes);
```

**Pros:**
- Direct PNG output (no conversion needed)
- Zero dependencies
- Explicitly designed for Workers
- TypeScript support
- Tree-shakable (only import PNG generator)
- Prior research validated this choice

**Cons:**
- Relies on `CompressionStream` (web standard, but less common usage pattern)
- Less popular than `uqr` (fewer GitHub stars)

**Risks:**
- Low: CompressionStream is a web standard supported by Workers
- Low: Library is actively maintained

**Prerequisites:**
- Install: `pnpm --filter=@sabaipics/api add @juit/qrcode`

**Red flags:** None identified.

---

### Option B: uqr (SVG) + Browser conversion for PNG
**Approach:** Use `uqr` for SVG generation, let browser convert to PNG on download.

**Implementation:**
```typescript
import { renderSVG } from "uqr";

const svg = renderSVG(
  `https://sabaipics.com/search/${accessCode}`,
  { ecc: "M", border: 2 }
);
await env.PHOTOS_BUCKET.put(`qr/${eventId}.svg`, svg, {
  httpMetadata: { contentType: "image/svg+xml" }
});
```

Client-side PNG conversion:
```typescript
const img = new Image();
img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
const canvas = document.createElement("canvas");
// ... draw and export as PNG
```

**Pros:**
- Zero dependencies
- Maintained by reputable org (UnJS)
- SVG is simpler to generate
- Smaller server-side footprint

**Cons:**
- Requires client-side conversion for PNG download
- More complex download UX
- Not directly printable from URL (needs conversion)

**Risks:**
- Medium: Client-side conversion adds complexity
- Low: SVG support is universal

**Prerequisites:**
- Install: `pnpm --filter=@sabaipics/api add uqr`
- Client-side conversion code in dashboard

**Red flags:** Added client complexity for PNG download.

---

### Option C: uqr (SVG only, accept SVG downloads)
**Approach:** Use `uqr`, store and serve SVG only, no PNG.

**Implementation:**
Same as Option B server-side, but download SVG directly.

**Pros:**
- Simplest implementation
- Infinite scalability for printing
- Smallest bundle size impact

**Cons:**
- Some users may not understand SVG format
- Certain print workflows expect PNG/JPG
- "Download QR code" expectation is typically PNG

**Risks:**
- Medium: User confusion about SVG format
- Low: Technical implementation

**Prerequisites:**
- Install: `pnpm --filter=@sabaipics/api add uqr`

**Red flags:** UX mismatch with user expectations.

---

## 6. Comparison Matrix

| Criteria | Option A (@juit/qrcode) | Option B (uqr + conversion) | Option C (SVG only) |
|----------|-------------------------|----------------------------|---------------------|
| Workers compatibility | Yes | Yes | Yes |
| PNG output | Native | Client-side | No |
| Bundle size | Small (~15-20 KB est.) | Smallest (~5 KB est.) | Smallest |
| Implementation complexity | Low | Medium | Lowest |
| User expectations met | Yes | Partial | Partial |
| Print workflow | Direct | Requires conversion | May confuse |
| Maintenance risk | Low | Low | Low |

---

## 7. Recommendation

**Recommended: Option A (@juit/qrcode)**

### Rationale
1. **Direct PNG output** matches user expectation for "Download QR code"
2. **Workers-native design** eliminates runtime compatibility concerns
3. **Zero dependencies** keeps bundle size minimal
4. **Prior research validation** confirms this choice
5. **TypeScript support** aligns with codebase conventions
6. **Single responsibility** - server handles QR generation completely

### Trade-off accepted
- Slightly larger bundle than SVG-only option (acceptable given 10MB limit)

### Decision criteria for human reviewer
- If minimizing bundle size is critical: Consider Option C (SVG only)
- If client-side code reduction is priority: Option A is clearly superior
- If there's future need for PDF QR codes: Option A supports PDF natively

---

## 8. Open Questions (for HI decision)

1. **Storage strategy:** Generate QR on event creation (eager) vs on-demand (lazy)?
   - Eager: QR stored in R2, served from cache, ~1-5 KB per event
   - Lazy: Generated on each request, cached via HTTP headers
   - **Recommendation:** Eager (store in R2) for simplicity and offline access

2. **QR error correction level:**
   - L (7%): Smaller QR, less resilient
   - M (15%): Balanced (recommended)
   - Q (25%): Higher resilience for printing
   - H (30%): Maximum resilience
   - **Recommendation:** M (balanced) unless photographers request higher

3. **URL base configuration:**
   - Hardcode `https://sabaipics.com/search/`
   - Use environment variable (e.g., `APP_URL`)
   - **Recommendation:** Environment variable for flexibility

---

## 9. References

- @juit/qrcode npm: https://www.npmjs.com/package/@juit/qrcode
- @juit/qrcode GitHub: https://github.com/juitnow/juit-qrcode
- uqr npm: https://www.npmjs.com/package/uqr
- qrcode-svg npm: https://www.npmjs.com/package/qrcode-svg
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Prior research: `.claude.bak/_logs/S1/research/qr-code-generation.md`
