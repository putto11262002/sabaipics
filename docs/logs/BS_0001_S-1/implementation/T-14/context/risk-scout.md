# Risk Scout Report

Task: T-14 — QR code generation library
Root: BS_0001_S-1
Date: 2026-01-10

## Executive Summary

T-14 is a foundational scaffold task to integrate `@juit/qrcode` library for server-side QR code generation in Cloudflare Workers. This is a **blocking dependency** for T-13 (Events API). The task is low-complexity but has critical downstream impact on event creation flow and printable QR code quality. Key risks center around Workers runtime compatibility, bundle size, and QR code content validation to prevent injection attacks.

---

## Technical Risks

### 1. Cloudflare Workers Runtime Compatibility

**Risk:** Library depends on `CompressionStream` web standard for PNG deflate compression.

**Analysis:**
- Research doc (`docs/logs/BS_0001_S-1/research/qr-code-library.md`) confirms `@juit/qrcode` explicitly supports Workers
- Uses `CompressionStream` (web standard) instead of Node.js zlib
- Current `wrangler.jsonc` has `nodejs_compat` flag enabled, but this library doesn't need it
- Existing package.json has no QR libraries installed

**Validation needed:**
```typescript
// Test in Workers environment
import { generatePngQrCode } from "@juit/qrcode";
const png = await generatePngQrCode("test", { ecLevel: "M" });
console.log(png instanceof Uint8Array); // Should be true
```

**Mitigation:** Add unit test that verifies PNG generation works in Workers vitest pool (`@cloudflare/vitest-pool-workers` already configured).

**Severity:** Low (library explicitly designed for Workers, but needs validation)

---

### 2. Bundle Size Impact

**Risk:** Adding QR generation library increases Worker bundle size, potentially hitting 10MB compressed limit.

**Current state:**
- Workers limit: 10MB compressed (paid plan), 3MB (free plan)
- No existing image generation libraries in `apps/api/package.json`
- Dependencies: Hono, Zod, Stripe, AWS SDK (Rekognition), Svix, LINE SDK

**Analysis from research:**
- `@juit/qrcode` is zero-dependency, tree-shakable
- Estimated size: ~15-20 KB (uncompressed)
- Much smaller than AWS SDK (~500 KB) already in use

**Mitigation:** 
- Use tree-shaking: `import { generatePngQrCode } from "@juit/qrcode"` (not `import * as qr`)
- Monitor bundle size in build output
- If needed in future, consider code splitting (unlikely for 15-20 KB)

**Severity:** Low (negligible impact on bundle size)

---

### 3. QR Code Scannability Requirements

**Risk:** Generated QR codes must be scannable by mobile cameras across various devices/lighting conditions.

**From plan (`docs/logs/BS_0001_S-1/plan/final.md`):**
- QR encodes two URLs: search and slideshow
- Target audience: Thai photographers and event attendees
- Use case: Print on event materials (posters, cards) AND display on screens

**Content to encode:**
```
Search:    https://sabaipics.com/search/{accessCode}
Slideshow: https://sabaipics.com/event/{accessCode}/slideshow
```

**Questions:**
- [NEED_DECISION] How to encode two URLs in one QR code?
  - Option A: Encode both URLs separated by newline (scanners may only read first line)
  - Option B: Encode search URL only, show slideshow link on search page
  - Option C: Generate two separate QR codes (complicates UI/storage)
  - Option D: Encode a landing page that shows both options

**Recommendation:** Option B - encode search URL only. Simpler, more reliable scanning, follows common pattern.

**Error correction level:**
- Research recommends "M" (15% error correction) for balanced use
- Plan decision #2: "M (balanced) unless photographers request higher"
- Higher levels (Q/H) create larger, denser QR codes that may be harder to scan at small sizes

**Mitigation:**
- Use error correction level "M" (medium)
- Add margin (quiet zone) of at least 4 modules
- Test scanning with:
  - iPhone camera app (iOS 15+)
  - LINE in-app scanner
  - Android Chrome camera
  - Low-light conditions
  - Printed at various sizes (business card, A4 poster)

**Severity:** Medium (UX critical - must work reliably in real-world conditions)

---

### 4. PNG Output Quality for Printing

**Risk:** QR code PNG must be high-resolution enough for printing without pixelation.

**Analysis:**
- Default QR code size in `@juit/qrcode` is module-based (not pixel-based)
- Need to specify pixel dimensions for print quality
- Typical QR code for 40-50 char URL: ~25x25 modules (Version 2)
- For print: recommend 10-15 pixels per module = 250-375px image
- At 300 DPI: 375px = ~1.25 inches (3.2 cm) - suitable for business cards/flyers

**Library options:**
```typescript
generatePngQrCode(url, {
  ecLevel: "M",        // Error correction
  margin: 4,           // Quiet zone (modules)
  // Size is auto-calculated based on content length
});
```

**[GAP] Library documentation doesn't specify how to control output pixel dimensions**

**Mitigation:**
- Test generated QR code pixel dimensions
- If too small, may need to upscale via image processing (adds complexity)
- Or accept auto-sized output and document minimum print size

**Severity:** Medium (affects print quality, but likely acceptable at default size)

---

### 5. Multiple URL Encoding Strategy

**Risk:** Task spec mentions "two URLs (search + slideshow)" but QR encoding strategy not finalized.

**From tasks.md (T-13):**
> Generate QR PNG with two URLs (search + slideshow)

**From plan.md:**
> QR encodes:
> Search:    https://sabaipics.com/search/{accessCode}
> Slideshow: https://sabaipics.com/event/{accessCode}/slideshow

**Analysis:**
- Standard QR codes encode single text/URL
- Multi-URL QR codes typically encode vCard/structured data
- Common approach: encode landing page that presents both options
- Or: encode search URL only, link to slideshow from there

**[NEED_DECISION] QR encoding strategy**

Options:
- A) Single QR with search URL only (slideshow link on search page)
- B) Single QR with newline-separated URLs (scanner behavior unpredictable)
- C) Single QR with landing page showing both options
- D) Two separate QR codes (storage: 2x, UI complexity)

**Recommendation:** Option A - simpler, more reliable, follows UX best practice.

**Severity:** Medium (blocks T-13 implementation without decision)

---

## Security Concerns

### 1. QR Code Content Injection

**Risk:** If `accessCode` is not properly validated, malicious codes could inject URLs pointing to phishing sites.

**Attack vector:**
```
Malicious accessCode: "ABC123\nhttps://evil.com"
Result: QR encodes multiple URLs, scanner redirects to evil.com
```

**Current state:**
- Schema (`packages/db/src/schema/events.ts`): `accessCode: text("access_code").notNull().unique()`
- No format validation visible in schema
- T-13 must generate `access_code` - need to ensure it's alphanumeric only

**Mitigation for T-14:**
```typescript
// In QR generation wrapper
export function generateEventQR(accessCode: string): Promise<Uint8Array> {
  // Validate: alphanumeric only, 6 chars
  if (!/^[A-Z0-9]{6}$/.test(accessCode)) {
    throw new Error("Invalid access code format");
  }
  
  const url = `https://sabaipics.com/search/${accessCode}`;
  return generatePngQrCode(url, { ecLevel: "M", margin: 4 });
}
```

**Mitigation for T-13:**
- Generate `accessCode` as 6-char uppercase alphanumeric (e.g., `nanoid(6).toUpperCase()`)
- Validate format before DB insert
- Re-validate in QR generation (defense in depth)

**Severity:** High (security boundary - must validate untrusted input)

---

### 2. URL Base Configuration (Open Redirect Prevention)

**Risk:** Hardcoded URL base could become a maintenance issue or security risk if not configurable.

**From research doc decision:**
> **Recommendation:** Environment variable for flexibility

**Analysis:**
- Currently no `APP_URL` or `PUBLIC_URL` in `wrangler.jsonc`
- Should be configurable per environment (dev/staging/prod)
- Prevents accidental open redirects if base URL changes

**Recommendation:**
```typescript
// wrangler.jsonc
"vars": {
  "APP_BASE_URL": "http://localhost:5173"  // Dev
}

// In production env
"vars": {
  "APP_BASE_URL": "https://sabaipics.com"
}

// In QR generation
const url = `${env.APP_BASE_URL}/search/${accessCode}`;
```

**[NEED_DECISION] Should APP_BASE_URL be configurable or hardcoded?**

**Recommendation:** Make it configurable for flexibility (staging/prod, future custom domains).

**Severity:** Low (best practice, not critical for MVP)

---

### 3. QR Code Content Length Limits

**Risk:** Very long URLs could exceed QR code capacity or create dense, unscannable codes.

**Analysis:**
- Max URL: `https://sabaipics.com/search/ABCDEF` = ~43 characters
- QR code capacity: 4,296 characters (alphanumeric, low error correction)
- Our use case is well within limits

**Mitigation:** Not needed for this use case, but could add length check in wrapper.

**Severity:** Very Low (not a risk for our use case)

---

## Hidden Coupling

### Upstream Dependencies

**T-14 depends on:**
- None (scaffold task, can be implemented independently)

**Blocked by:**
- None

---

### Downstream Consumers

**T-14 blocks:**
- **T-13 (Events API)** - Primary consumer, creates events and generates QR codes
  - Calls `generateEventQR(accessCode)` during event creation
  - Uploads result to R2 (`PHOTOS_BUCKET`)
  - Stores R2 key in `events.qr_code_r2_key`

**Expected usage in T-13:**
```typescript
// POST /events handler
const accessCode = generateAccessCode(); // 6-char unique
const qrPng = await generateEventQR(accessCode);
const r2Key = `qr/${eventId}.png`;
await env.PHOTOS_BUCKET.put(r2Key, qrPng, {
  httpMetadata: { contentType: "image/png" }
});
```

---

### Implicit Dependencies

**Environment variables:**
- `APP_BASE_URL` (if we make URL configurable) - needs to be set in all environments

**R2 bucket:**
- `PHOTOS_BUCKET` binding already configured in `wrangler.jsonc`
- QR codes stored in `qr/` prefix
- R2 lifecycle rule (from plan): delete QR codes after 30 days

**Schema coupling:**
- `events.qr_code_r2_key` (text, nullable) - stores R2 key
- `events.access_code` (text, unique, not null) - must be validated format

---

### Integration Points

**File locations (T-14 deliverables):**
- `apps/api/src/lib/qr/generate.ts` - QR generation wrapper
- `apps/api/src/lib/qr/index.ts` - Exports
- Unit tests: `apps/api/src/lib/qr/generate.test.ts`

**Integration with T-13:**
- T-13 imports: `import { generateEventQR } from "../lib/qr"`
- T-13 handles R2 upload (not T-14's responsibility)

---

## HI Gates (Need Approval Before Proceeding)

### [NEED_DECISION] QR Encoding Strategy

**Question:** How should the QR code encode two URLs (search + slideshow)?

**Options:**
- A) Single URL to search page (slideshow link shown on search page)
- B) Newline-separated URLs (unreliable scanner behavior)
- C) Landing page that presents both options
- D) Two separate QR codes

**Impact:** Affects T-13 implementation, UI design, user experience

**Recommendation:** Option A (search URL only)

**Blocker:** Medium - T-13 can proceed with Option A as default, but should be confirmed

---

### [NEED_DECISION] APP_BASE_URL Configuration

**Question:** Should the URL base be hardcoded or environment-configurable?

**Options:**
- A) Hardcode `https://sabaipics.com` (simpler)
- B) Use environment variable `APP_BASE_URL` (flexible)

**Impact:** 
- Option A: Staging QR codes point to production (acceptable if staging uses separate domain)
- Option B: Proper staging/prod separation

**Recommendation:** Option B (configurable)

**Blocker:** Low - can default to production URL and make configurable later

---

### [NEED_DECISION] Error Correction Level

**Question:** Use "M" (15%) or "Q" (25%) error correction?

**Options:**
- M: Smaller QR, faster scanning, less print resilience
- Q: Larger QR, more print resilience, may be harder to scan at small sizes

**Research recommendation:** M (balanced)

**Impact:** Affects print quality and scanning reliability

**Recommendation:** Start with M, allow override if photographers request higher

**Blocker:** Low - research already chose M, just need confirmation

---

### [NEED_VALIDATION] Access Code Format

**Question:** What is the exact format for `accessCode`?

**From plan:** "6-char code for QR"

**Need to confirm:**
- Character set: uppercase alphanumeric? (A-Z0-9)
- Generation method: random? sequential? nanoid?
- Collision handling: retry on unique constraint violation?

**Impact:** T-14 wrapper needs to validate format; T-13 needs to generate it

**Recommendation:** 6-char uppercase alphanumeric (A-Z0-9), using nanoid or similar

**Blocker:** Low - T-14 can accept any string and validate format; T-13 decides generation

---

## Mitigation Strategies

### For Technical Risks

1. **Workers Compatibility:**
   - Add integration test using `@cloudflare/vitest-pool-workers`
   - Test actual PNG generation in Workers environment
   - Verify `CompressionStream` availability

2. **Bundle Size:**
   - Use tree-shaking imports only
   - Monitor bundle size in CI (if available)
   - Document actual impact after install

3. **Scannability:**
   - Use error correction level "M"
   - Set margin to 4 modules
   - Manual testing checklist:
     - [ ] iPhone camera
     - [ ] LINE in-app scanner
     - [ ] Android Chrome
     - [ ] Low-light conditions
     - [ ] Printed at business card size
     - [ ] Printed at A4 poster size

4. **Print Quality:**
   - Test actual pixel dimensions of generated PNG
   - Document minimum print size (e.g., "2 cm x 2 cm minimum")
   - If too small, consider upscaling or library alternatives

---

### For Security Concerns

1. **Content Injection:**
   - Validate `accessCode` format (alphanumeric only)
   - Use parameterized URL construction (template literal with validated input)
   - Add unit test for malicious input rejection

2. **URL Configuration:**
   - Add `APP_BASE_URL` to `wrangler.jsonc` vars (all envs)
   - Default to production URL if not set (fail-safe)
   - Document environment variables in README

---

### For Integration Risks

1. **T-13 Coordination:**
   - Define clear interface: `generateEventQR(accessCode: string): Promise<Uint8Array>`
   - Document expected input format
   - Provide usage example in JSDoc
   - Consider exporting type: `export type QROptions = { ecLevel: "L" | "M" | "Q" | "H" }`

2. **R2 Upload Pattern:**
   - T-14 returns raw `Uint8Array`
   - T-13 handles R2 upload with proper content-type
   - Document this separation of concerns

---

## Merge Conflict Hotspots

### Low Risk: New Directory

**File:** `apps/api/src/lib/qr/` (new directory)

**Reason:** T-14 creates new isolated directory, no existing code to conflict with

**Mitigation:** None needed

---

### Low Risk: package.json

**File:** `apps/api/package.json`

**Reason:** Only adds one dependency: `@juit/qrcode`

**Conflict potential:** Other tasks (T-13, future tasks) may add dependencies simultaneously

**Mitigation:** 
- Lock file will handle merges automatically
- If conflict, just accept both additions

---

### No Risk: wrangler.jsonc

**Reason:** Only adds environment variable (if we choose configurable URL)

**Conflict potential:** Very low, vars section is additive

---

## Testing Strategy

### Unit Tests (Must Have)

```typescript
// apps/api/src/lib/qr/generate.test.ts

describe("generateEventQR", () => {
  it("generates valid PNG for 6-char alphanumeric code", async () => {
    const png = await generateEventQR("ABC123");
    expect(png).toBeInstanceOf(Uint8Array);
    expect(png.length).toBeGreaterThan(0);
  });

  it("rejects codes with invalid characters", async () => {
    await expect(generateEventQR("abc!@#")).rejects.toThrow("Invalid access code");
  });

  it("rejects codes with wrong length", async () => {
    await expect(generateEventQR("ABC")).rejects.toThrow("Invalid access code");
  });

  it("encodes correct URL format", async () => {
    // Would need QR decoder to verify, or mock the library
    // For MVP, trust library and validate input only
  });
});
```

---

### Integration Tests (Should Have)

```typescript
// Test in Workers environment
import { env } from "cloudflare:test";
import { generateEventQR } from "./generate";

it("works in Workers runtime", async () => {
  const png = await generateEventQR("TEST01");
  expect(png).toBeInstanceOf(Uint8Array);
  
  // Verify can upload to R2
  await env.PHOTOS_BUCKET.put("test-qr.png", png);
  const uploaded = await env.PHOTOS_BUCKET.get("test-qr.png");
  expect(uploaded).toBeTruthy();
});
```

---

### Manual Tests (Required Before T-13 Integration)

- [ ] Generate QR code for test access code
- [ ] Download PNG, verify file size and dimensions
- [ ] Scan with iPhone camera app
- [ ] Scan with LINE in-app scanner
- [ ] Scan with Android Chrome camera
- [ ] Print at business card size (5cm x 5cm), scan printed version
- [ ] Print at poster size (10cm x 10cm), scan from 2m distance
- [ ] Test in low-light conditions

---

## Implementation Checklist

### Pre-Implementation

- [ ] Review QR encoding strategy decision (single URL vs two URLs)
- [ ] Confirm access code format (6-char alphanumeric)
- [ ] Decide on APP_BASE_URL configuration (hardcoded vs env var)

---

### Implementation (T-14 Scope)

- [ ] Install dependency: `pnpm --filter=@sabaipics/api add @juit/qrcode`
- [ ] Create `apps/api/src/lib/qr/generate.ts`
  - [ ] Export `generateEventQR(accessCode: string): Promise<Uint8Array>`
  - [ ] Validate access code format (regex: `/^[A-Z0-9]{6}$/`)
  - [ ] Construct URL with env var or hardcoded base
  - [ ] Call `generatePngQrCode` with options: `{ ecLevel: "M", margin: 4 }`
- [ ] Create `apps/api/src/lib/qr/index.ts` (barrel export)
- [ ] Write unit tests in `apps/api/src/lib/qr/generate.test.ts`
  - [ ] Valid input test
  - [ ] Invalid character test
  - [ ] Invalid length test
- [ ] Update `apps/api/package.json` (auto via pnpm add)
- [ ] Add environment variable to `wrangler.jsonc` (if configurable)

---

### Validation (T-14 Acceptance)

- [ ] Unit tests pass (format validation)
- [ ] Integration test in Workers environment passes
- [ ] Generated QR is scannable (manual test)
- [ ] PNG file size reasonable (<5 KB typical)
- [ ] Bundle size impact documented (<25 KB estimated)

---

### Handoff to T-13

- [ ] Document usage example in code comments
- [ ] Confirm interface: `generateEventQR(accessCode: string): Promise<Uint8Array>`
- [ ] Confirm T-13 owns R2 upload logic
- [ ] Provide sample access code for testing

---

## Open Questions for Human Review

1. **QR Encoding Strategy** - Single URL vs two URLs (recommendation: single URL to search page)

2. **URL Base Configuration** - Hardcoded vs environment variable (recommendation: env var)

3. **Access Code Format** - Exact character set and generation method (recommendation: uppercase A-Z0-9, 6 chars)

4. **Print Size Guidance** - Should we document minimum print size? (recommendation: yes, add to photographer docs)

5. **Error Correction Override** - Should photographers be able to request higher error correction later? (recommendation: no for MVP, can add if needed)

---

## Provenance

**Files examined:**
- `docs/logs/BS_0001_S-1/tasks.md` - Task definition for T-14
- `docs/logs/BS_0001_S-1/research/qr-code-library.md` - Library selection research
- `docs/logs/BS_0001_S-1/plan/final.md` - Execution plan with QR requirements
- `apps/api/package.json` - Current dependencies
- `apps/api/wrangler.jsonc` - Workers configuration
- `packages/db/src/schema/events.ts` - Events table schema
- `apps/api/src/queue/photo-consumer.ts` - R2 usage pattern
- `docs/logs/BS_0001_S-1/implementation/T-6/context/risk-scout.md` - Exemplar risk scout
- `docs/logs/BS_0001_S-1/implementation/T-7/context/risk-scout.md` - Exemplar risk scout

**Research references:**
- `@juit/qrcode` npm: https://www.npmjs.com/package/@juit/qrcode
- `@juit/qrcode` GitHub: https://github.com/juitnow/juit-qrcode
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/

**Decisions referenced:**
- Plan decision #2: Image format handling (normalize to JPEG)
- Plan decision #7: QR codes (eager generation, two URLs) - NEEDS CLARIFICATION
- Research decision: `@juit/qrcode` library selection
- Research decision: Error correction level "M" (balanced)
