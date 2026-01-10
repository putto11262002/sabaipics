# Upstream Dossier

Task: T-14 — QR code generation library
Root: BS_0001_S-1
Date: 2026-01-10

## Task definition (from tasks.md)

- **Title:** QR code generation library
- **Type:** `scaffold`
- **Surface:** API
- **Dependencies:** None
- **Story refs:** US-5 (Create event), US-6 (QR display)
- **Scope:** `apps/api/src/lib/qr/`

### Description
Add `@juit/qrcode` and create wrapper function for generating QR PNGs with two URLs.

### Acceptance criteria
- `generateEventQR(accessCode)` returns PNG Uint8Array
- QR contains both search and slideshow URLs
- Works in Cloudflare Workers environment

### Tests
- Unit test QR generation
- Verify generated QR is scannable

### Rollout/Risk
- Low risk

## Upstream plan context (from plan/final.md)

### Position in execution strategy
- **Phase:** Phase 0 (Foundation) / Phase 3 (Events)
- **Parallel opportunity:** Can be implemented independently alongside other Phase 0 tasks (T-2, T-3, T-7, T-8, T-18)
- **Blocks:** T-13 (Events API) which depends on this library for QR generation

### QR generation requirements (from Phase 3)
From plan section "US-5: Create event":
- Generate QR PNG with 2 URLs on event creation
- Upload QR to R2
- QR encodes:
  - Search: `https://sabaipics.com/search/{accessCode}`
  - Slideshow: `https://sabaipics.com/event/{accessCode}/slideshow`

### Storage strategy decision
From plan section "Open Questions":
- **Decision:** Eager generation (store in R2 on event creation)
- QR stored in R2, served from cache, ~1-5 KB per event
- Provides offline access and simpler implementation

## Linked ADRs / research

### Primary research: qr-code-library.md
Path: `docs/logs/BS_0001_S-1/research/qr-code-library.md`

**Recommendation:** Option A (@juit/qrcode) - APPROVED

**Key findings:**
- Library explicitly designed for Cloudflare Workers
- Direct PNG output (no conversion needed)
- Zero dependencies
- Uses web standard `CompressionStream` for deflate compression
- TypeScript support included
- Tree-shakable exports

**Technical constraints from research:**
- Runtime: Cloudflare Workers (edge runtime, not Node.js)
- `nodejs_compat` flag enabled in wrangler.jsonc
- Output format: PNG (for download and print compatibility)
- Storage: R2 bucket (`PHOTOS_BUCKET` already configured)
- URL length: ~35-50 characters (well within QR capacity)
- Worker size limit: 10 MB compressed (paid plan)
- Memory limit: 128 MB per isolate

**Quality requirements:**
1. Scannable by mobile cameras
2. Printable (PNG output for physical printing)
3. Downloadable from dashboard
4. Fast generation (< 100ms acceptable)

**Rejected alternatives:**
- Option B (uqr + client-side conversion): Too complex
- Option C (SVG only): UX mismatch with user expectations
- node-qrcode, qr-image: Not Workers-compatible

## Critical constraints

### Must-follow rules from upstream

1. **Library selection (LOCKED):**
   - MUST use `@juit/qrcode` (validated in research)
   - NO Canvas API dependencies (Workers incompatible)
   - NO Node.js-specific libraries

2. **Function signature (CONTRACT):**
   - Function name: `generateEventQR(accessCode: string)`
   - Return type: `Promise<Uint8Array>` (PNG bytes)
   - Must be async (uses CompressionStream)

3. **QR content (DUAL URL REQUIREMENT):**
   - MUST encode TWO URLs in QR:
     - Search: `https://sabaipics.com/search/{accessCode}`
     - Slideshow: `https://sabaipics.com/event/{accessCode}/slideshow`
   - [NEED_DECISION] How to encode two URLs in single QR?
     - Option 1: Two separate QR codes
     - Option 2: Single QR with landing page + navigation
     - Option 3: Single QR with primary URL (search), secondary via UI
   - [GAP] Base URL configuration strategy not specified
     - Hardcode vs environment variable
     - Research recommends env var (`APP_URL`)

4. **Runtime compatibility (HARD REQUIREMENT):**
   - MUST work in Cloudflare Workers
   - MUST NOT use Node.js-specific APIs
   - MUST NOT use Canvas API

5. **Output requirements:**
   - Format: PNG (not SVG, not PDF)
   - Error correction level: [NEED_DECISION] L/M/Q/H
     - Research recommends M (15% resilience, balanced)
   - Margin: [GAP] Not specified (research uses `margin: 4`)
   - Size/resolution: [GAP] Not specified

6. **Installation:**
   - Package: `@juit/qrcode`
   - Target: `apps/api` package
   - Command: `pnpm --filter=@sabaipics/api add @juit/qrcode`

7. **Testing requirements:**
   - MUST unit test QR generation
   - MUST verify QR is scannable (how? manual test? decoder lib?)
   - [NEED_VALIDATION] Scannable verification method not specified

### Dependencies status (from tasks.md)
- None (foundation task, no blockers)

### Blocks downstream
- **T-13 (Events API)** depends on this library
  - T-13 will call `generateEventQR()` during event creation
  - T-13 uploads result to R2
  - T-13 stores `qr_code_r2_key` in events table

## Gaps & Open Questions

### [GAP] Two-URL encoding strategy
**Context:** Plan requires "QR PNG with 2 URLs" but doesn't specify mechanism.
**Options:**
1. Single QR → landing page → two buttons (search / slideshow)
2. Two separate QR codes in single PNG (side-by-side)
3. Primary QR (search), slideshow link in UI only

**Recommendation needed before implementation.**

### [GAP] Base URL configuration
**Context:** Research recommends env var, not specified in plan.
**Question:** Hardcode `sabaipics.com` or use `APP_URL` env var?

### [GAP] QR parameters not specified
- Error correction level (research: M)
- Margin size (research: 4)
- Output resolution/size (mobile scanning needs min 200px?)

### [NEED_VALIDATION] Scannable verification
**Question:** How to verify "QR is scannable" in automated test?
- Manual test only?
- Use QR decoder library (e.g., jsQR)?
- Visual inspection in CI?

## Implementation Notes

### Expected file structure
```
apps/api/src/lib/qr/
├── index.ts           # Main export
├── generator.ts       # generateEventQR implementation
└── generator.test.ts  # Unit tests
```

### Expected implementation pattern (from research)
```typescript
import { generatePngQrCode } from "@juit/qrcode";

export async function generateEventQR(
  accessCode: string
): Promise<Uint8Array> {
  const url = `https://sabaipics.com/search/${accessCode}`; // [GAP] base URL?
  
  const pngBytes = await generatePngQrCode(url, {
    ecLevel: "M",  // [GAP] confirm level
    margin: 4      // [GAP] confirm margin
  });
  
  return pngBytes;
}
```

### Integration point (T-13)
From tasks.md T-13 acceptance:
```typescript
// In T-13 (Events API):
import { generateEventQR } from "~/lib/qr";

const qrPng = await generateEventQR(accessCode);
await env.PHOTOS_BUCKET.put(`qr/${eventId}.png`, qrPng);
```

## Success Criteria Checklist

From acceptance criteria:
- [ ] `generateEventQR(accessCode)` function exists
- [ ] Returns `Uint8Array` (PNG bytes)
- [ ] Contains [search URL | both URLs?] — CLARIFY
- [ ] Works in Workers (no runtime errors)
- [ ] Unit test passes
- [ ] QR is scannable (verification method TBD)

## Risk Assessment

**Overall risk:** Low (per tasks.md)

**Specific risks:**
1. **Two-URL encoding ambiguity:** Medium impact if wrong interpretation
   - Mitigation: Clarify with PM/tech lead before implementation
2. **CompressionStream compatibility:** Low (web standard, Workers supports)
3. **Bundle size:** Low (~15-20 KB, well under 10 MB limit)
4. **Scannable verification:** Low (can defer to manual testing if needed)

## References

- Task definition: `docs/logs/BS_0001_S-1/tasks.md#T-14`
- Research: `docs/logs/BS_0001_S-1/research/qr-code-library.md`
- Plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Library docs: https://www.npmjs.com/package/@juit/qrcode
- Downstream consumer: T-13 (Events API)
