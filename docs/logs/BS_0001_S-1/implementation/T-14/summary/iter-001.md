# Implementation Summary (iter-001)

Task: `T-14 — QR code generation library`
Root: `BS_0001_S-1`
Branch: `task/T-14-qr-library`
PR: pending
Date: `2026-01-10`

## Outcome

Successfully implemented a minimal QR code generation library wrapping `@juit/qrcode` for Cloudflare Workers. The library generates PNG QR codes for event access codes that encode search URLs. All unit tests pass (8/8), type checking passes, and manual verification confirms valid PNG generation.

**Delivered:**
- ✅ QR generation function with input validation
- ✅ Environment variable configuration (`APP_BASE_URL`)
- ✅ Comprehensive unit tests (8 test cases)
- ✅ Type-safe implementation
- ✅ Documentation via JSDoc

**Bundle impact:** +51 packages (~15-20 KB estimated), within acceptable limits

## Key code changes

- `apps/api/src/lib/qr/generate.ts` — Core QR generation logic with validation
  - `generateEventQR(accessCode, baseUrl)` function
  - Input validation: 6-char uppercase A-Z0-9
  - QR parameters: error correction "M" (15%), margin 4 modules

- `apps/api/src/lib/qr/index.ts` — Barrel export for clean imports

- `apps/api/src/lib/qr/generate.test.ts` — Unit tests (8 test cases)
  - Valid PNG generation
  - Format validation (lowercase, special chars, wrong length)
  - Different codes generate different QR codes

- `apps/api/wrangler.jsonc` — Added `APP_BASE_URL` to all environments
  - Development: `http://localhost:5173`
  - Staging: `https://app-staging.sabaipics.com`
  - Production: `https://sabaipics.com`

- `apps/api/.dev.vars` — Added `APP_BASE_URL` for local development

- `apps/api/src/types.ts` — Extended `Bindings` type with `APP_BASE_URL`

- `apps/api/package.json` — Added dependency `@juit/qrcode`

## Behavioral notes

### Success path
1. Caller provides 6-char uppercase alphanumeric code (e.g., "ABC123")
2. Function validates format via regex `/^[A-Z0-9]{6}$/`
3. Constructs URL: `{baseUrl}/search/{accessCode}`
4. Generates QR PNG using `@juit/qrcode` with:
   - Error correction level: "M" (15%)
   - Margin: 4 modules (quiet zone)
5. Returns `Uint8Array` (PNG bytes)

**Generated QR specs:**
- Format: PNG (8-bit grayscale, non-interlaced)
- Size: ~267 bytes typical (37x37 pixels for short URLs)
- Encoding: Search URL only (slideshow is separate UI feature)

### Key failure modes handled

**Invalid access code format:**
- Lowercase characters → throws descriptive error
- Special characters → throws descriptive error
- Wrong length (< 6 or > 6) → throws descriptive error
- Empty string → throws descriptive error

**Error message format:**
```
Invalid access code format: "{accessCode}". Must be 6 uppercase alphanumeric characters (A-Z0-9).
```

**Not handled (by design):**
- Missing/invalid `baseUrl` — T-13 (consumer) must validate env var exists
- QR library errors — bubble up to caller for centralized error handling

### [KNOWN_LIMITATION] Scannability verification

Manual scannability testing deferred to T-13 integration phase. Unit tests verify:
- PNG format is valid (magic bytes check)
- Different codes generate different QR codes
- Output is non-zero length `Uint8Array`

Actual scanning with phone cameras (iPhone, LINE, Android) should be performed during T-13 PR review before merge.

## Ops / rollout

### Flags/env
- **`APP_BASE_URL`** (string, required) — Base URL for QR-encoded search URLs
  - Development: `http://localhost:5173`
  - Staging: `https://app-staging.sabaipics.com`
  - Production: `https://sabaipics.com`
  - Must be set in all environments before T-13 deployment

### Migrations/run order
- No database migrations
- No run order dependencies
- T-14 is pure library code, no side effects

### Integration points for T-13
```typescript
import { generateEventQR } from "../lib/qr";

// In POST /events handler
const qrPng = await generateEventQR(accessCode, env.APP_BASE_URL);

// Upload to R2
await env.PHOTOS_BUCKET.put(`qr/${eventId}.png`, qrPng, {
  httpMetadata: { contentType: "image/png" }
});
```

**Expected latency:** < 50ms per QR (observed: negligible in unit tests)

## How to validate

### Commands run
```bash
# Install dependency
pnpm --filter=@sabaipics/api add @juit/qrcode

# Type check all packages
pnpm check-types
# ✓ All packages type-checked successfully

# Run API unit tests
pnpm --filter=@sabaipics/api test
# ✓ 60 tests passed (8 new QR tests)

# Build API
pnpm --filter=@sabaipics/api build
# ✓ Build successful

# Build all packages
pnpm build
# ✓ All packages built successfully
```

### Key checks
- ✅ PNG magic bytes verified (89 50 4E 47)
- ✅ Valid access codes generate non-empty Uint8Array
- ✅ Invalid formats rejected with descriptive errors
- ✅ Different codes produce different QR PNGs
- ✅ Generated PNG is valid (37x37, 8-bit grayscale, 267 bytes)
- ✅ Type safety: `APP_BASE_URL` available in Bindings

### Manual scannability checklist (deferred to T-13)
Before T-13 merge, perform manual scanning tests:
- [ ] iPhone camera app (iOS 15+)
- [ ] LINE in-app scanner
- [ ] Android Chrome camera
- [ ] Verify URL is correct: `https://sabaipics.com/search/{accessCode}`
- [ ] Optional: Print at business card size and scan

**Acceptance:** Must scan successfully with at least 2 out of 3 device types.

## Follow-ups

### [ENG_DEBT] Add Workers environment integration test
**Context:** Unit tests run in Node.js environment via Vitest. Should add integration test using `@cloudflare/vitest-pool-workers` to verify QR generation works in actual Workers runtime.

**Priority:** Low (library is explicitly Workers-compatible, Node.js tests sufficient for MVP)

**Action:** Add Workers integration test in future iteration if time permits

### [ENG_DEBT] Automated QR decoding verification
**Context:** Current tests verify PNG format but don't decode QR content to verify URL. Manual testing deferred to T-13 integration.

**Priority:** Low (can add jsQR decoder library later if needed)

**Action:** Consider adding QR decoder to test suite for automated URL verification

### [PM_FOLLOWUP] Document minimum print size for photographers
**Context:** Generated QR is 37x37 pixels (~267 bytes). Need to document minimum physical print size for reliable scanning.

**Recommendation:** Minimum 2cm x 2cm at 300 DPI for business cards, 5cm x 5cm for posters

**Action:** Add to photographer onboarding docs when UI is built (T-15)

### [PM_FOLLOWUP] Error correction level tuning
**Context:** Using "M" (15% error correction) as default. If photographers report scanning issues with printed materials, may need to upgrade to "Q" (25%).

**Priority:** Low (M is standard for most QR use cases)

**Action:** Monitor feedback after T-13 deployment, adjust if needed

## Test coverage

**Unit tests:** 8 test cases
- ✅ Valid PNG generation for valid code
- ✅ PNG magic bytes verification
- ✅ Multiple valid codes
- ✅ Lowercase rejection
- ✅ Special characters rejection
- ✅ Too short rejection
- ✅ Too long rejection
- ✅ Empty string rejection
- ✅ Different codes generate different PNGs

**Integration tests:** Deferred to T-13 (QR + R2 upload)

**Manual tests:** PNG generation verified, scannability deferred to T-13

## Dependencies added

```json
{
  "@juit/qrcode": "^1.2.0"
}
```

**Impact:**
- +51 npm packages (transitive deps handled by pnpm)
- Estimated bundle size: ~15-20 KB (within 10 MB Workers limit)
- Zero native dependencies (pure JavaScript)
- Cloudflare Workers compatible (uses `CompressionStream` web standard)
