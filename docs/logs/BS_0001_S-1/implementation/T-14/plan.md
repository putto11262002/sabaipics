# Implementation Plan

Task: `T-14 — QR code generation library`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-10`
Owner: `Claude (implementv3)`

## Inputs
- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: T-14)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-14/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-14/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-14/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-14/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-14/context/risk-scout.md`

## Goal / non-goals

### Goal
Create a minimal, typed utility library that wraps `@juit/qrcode` to generate QR code PNGs for event access codes. The library must work in Cloudflare Workers and be ready for T-13 (Events API) to consume.

### Non-goals
- QR code rendering/display UI (handled by T-15 Dashboard UI)
- R2 upload logic (T-13's responsibility)
- Lazy/on-demand generation (eager generation on event creation)
- Multiple QR code formats beyond PNG
- Slideshow URL encoding (decision: search URL only, slideshow is separate feature)

## Approach (data-driven)

### Architecture decision: Minimal pattern
Based on codebase exemplars, QR generation fits the **LINE client pattern** (minimal, single-purpose utility):
- **Why not Stripe pattern?** No network calls, no retry logic, no complex error handling needed
- **Why not Rekognition pattern?** No AWS SDK complexity, no stateful client required
- **Chosen pattern:** Simple function export with input validation

### File structure
```
apps/api/src/lib/qr/
├── index.ts           # Barrel export (clean import for consumers)
├── generate.ts        # generateEventQR() implementation + validation
└── generate.test.ts   # Unit tests (co-located)
```

### Implementation steps

**1. Install dependency**
```bash
pnpm --filter=@sabaipics/api add @juit/qrcode
```
- Library selection validated in `docs/logs/BS_0001_S-1/research/qr-code-library.md`
- Zero dependencies, Cloudflare Workers compatible
- Estimated bundle impact: ~15-20 KB

**2. Create generate.ts**
Core function with input validation and typed interface:

```typescript
import { generatePngQrCode } from "@juit/qrcode";

/**
 * Generates a QR code PNG for an event access code.
 *
 * The QR encodes the search URL: {baseUrl}/search/{accessCode}
 * (Slideshow is a separate UI feature, not encoded in QR)
 *
 * @param accessCode - 6-character uppercase alphanumeric code (e.g., "ABC123")
 * @param baseUrl - Base URL for the app (from APP_BASE_URL env var)
 * @returns PNG image as Uint8Array (ready for R2 upload)
 * @throws Error if accessCode format is invalid
 *
 * @example
 * ```typescript
 * const qrPng = await generateEventQR("ABC123", env.APP_BASE_URL);
 * await env.PHOTOS_BUCKET.put(`qr/${eventId}.png`, qrPng);
 * ```
 */
export async function generateEventQR(
  accessCode: string,
  baseUrl: string
): Promise<Uint8Array> {
  // Validate access code format (security: prevent injection)
  if (!/^[A-Z0-9]{6}$/.test(accessCode)) {
    throw new Error(
      `Invalid access code format: "${accessCode}". Must be 6 uppercase alphanumeric characters (A-Z0-9).`
    );
  }

  // Construct search URL (decision: single URL, not two URLs)
  const searchUrl = `${baseUrl}/search/${accessCode}`;

  // Generate QR PNG with validated options
  const pngBytes = await generatePngQrCode(searchUrl, {
    ecLevel: "M",  // Decision: Medium (15%) error correction
    margin: 4,     // Standard quiet zone (4 modules)
  });

  return pngBytes;
}
```

**3. Create index.ts**
Barrel export for clean imports:

```typescript
export { generateEventQR } from "./generate";
```

**4. Add APP_BASE_URL environment variable**

To `apps/api/wrangler.jsonc` (vars section):
```json
{
  "vars": {
    "APP_BASE_URL": "https://sabaipics.com"
  }
}
```

To `apps/api/.dev.vars` (local development):
```
APP_BASE_URL=http://localhost:5173
```

Update `apps/api/src/types.ts` Bindings interface:
```typescript
export type Bindings = CloudflareBindings & {
  APP_BASE_URL: string;
  // ... existing bindings
};
```

**5. Write unit tests**
Create `apps/api/src/lib/qr/generate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateEventQR } from "./generate";

describe("generateEventQR", () => {
  const baseUrl = "https://sabaipics.com";

  it("generates valid PNG Uint8Array for valid access code", async () => {
    const result = await generateEventQR("ABC123", baseUrl);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);

    // Verify PNG magic bytes (89 50 4E 47)
    expect(result[0]).toBe(0x89);
    expect(result[1]).toBe(0x50);
    expect(result[2]).toBe(0x4e);
    expect(result[3]).toBe(0x47);
  });

  it("accepts different valid access codes", async () => {
    const codes = ["A1B2C3", "XXXXXX", "000000", "ZZZZZZ"];

    for (const code of codes) {
      const result = await generateEventQR(code, baseUrl);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it("rejects access code with lowercase characters", async () => {
    await expect(generateEventQR("abc123", baseUrl)).rejects.toThrow(
      /Invalid access code format/
    );
  });

  it("rejects access code with special characters", async () => {
    await expect(generateEventQR("ABC!@#", baseUrl)).rejects.toThrow(
      /Invalid access code format/
    );
  });

  it("rejects access code that is too short", async () => {
    await expect(generateEventQR("ABC", baseUrl)).rejects.toThrow(
      /Invalid access code format/
    );
  });

  it("rejects access code that is too long", async () => {
    await expect(generateEventQR("ABCDEFG", baseUrl)).rejects.toThrow(
      /Invalid access code format/
    );
  });

  it("rejects empty access code", async () => {
    await expect(generateEventQR("", baseUrl)).rejects.toThrow(
      /Invalid access code format/
    );
  });

  it("generates different PNGs for different access codes", async () => {
    const png1 = await generateEventQR("CODE01", baseUrl);
    const png2 = await generateEventQR("CODE02", baseUrl);

    // PNGs should be different (different QR content)
    expect(png1).not.toEqual(png2);
  });
});
```

### Validation approach

**Scannability verification:**
- Unit tests validate PNG format (magic bytes)
- Unit tests validate error handling (invalid formats rejected)
- Manual testing required for actual scannability (see Validation Plan below)
- Automated QR decoding not in scope for T-14 (can add later if needed)

## Contracts (only if touched)

### Function contract (PUBLIC API for T-13)
```typescript
generateEventQR(accessCode: string, baseUrl: string): Promise<Uint8Array>
```

**Inputs:**
- `accessCode`: 6-character uppercase alphanumeric string (A-Z0-9)
- `baseUrl`: Base URL for the application (from `env.APP_BASE_URL`)

**Outputs:**
- `Promise<Uint8Array>`: PNG image bytes (ready for R2 upload or HTTP response)

**Throws:**
- `Error`: If `accessCode` does not match format `/^[A-Z0-9]{6}$/`

**Example usage (T-13 integration):**
```typescript
import { generateEventQR } from "../lib/qr";

// In POST /events handler
const accessCode = "ABC123"; // Generated by T-13
const qrPng = await generateEventQR(accessCode, env.APP_BASE_URL);

// Upload to R2
const qrKey = `qr/${eventId}.png`;
await env.PHOTOS_BUCKET.put(qrKey, qrPng, {
  httpMetadata: { contentType: "image/png" }
});
```

### Environment variable (NEW)
- **Name:** `APP_BASE_URL`
- **Type:** `string`
- **Required:** Yes
- **Format:** Full URL with protocol (e.g., `https://sabaipics.com`)
- **Environments:**
  - Production: `https://sabaipics.com`
  - Staging: `https://staging.sabaipics.com` (if exists)
  - Local: `http://localhost:5173`

### No DB changes
T-14 is pure compute logic, no database schema changes.

### No API changes
T-14 is a library, not an HTTP endpoint. API integration happens in T-13.

## Success path

1. ✅ Install `@juit/qrcode` via pnpm
2. ✅ Create `apps/api/src/lib/qr/generate.ts` with `generateEventQR()` function
3. ✅ Add input validation (regex `/^[A-Z0-9]{6}$/`)
4. ✅ Create `apps/api/src/lib/qr/index.ts` barrel export
5. ✅ Add `APP_BASE_URL` to `wrangler.jsonc`, `.dev.vars`, and `Bindings` type
6. ✅ Write unit tests in `apps/api/src/lib/qr/generate.test.ts`
7. ✅ Run tests: `pnpm --filter=@sabaipics/api test`
8. ✅ Verify type checking: `pnpm check-types`
9. ✅ Verify build: `pnpm --filter=@sabaipics/api build`
10. ✅ Manual scannability test (generate QR, scan with phone)
11. ✅ Update task tracking in `docs/logs/BS_0001_S-1/tasks.md` (add PR link)

## Failure modes / edge cases (major only)

### 1. Invalid access code format
**Scenario:** T-13 passes malformed access code (lowercase, special chars, wrong length)

**Handling:** Throw descriptive error immediately (fail fast)
```typescript
throw new Error(`Invalid access code format: "${accessCode}". Must be 6 uppercase alphanumeric characters (A-Z0-9).`);
```

**Impact:** T-13 will receive error, can log and return 500 to client
**Mitigation:** T-13 should validate access code before calling `generateEventQR()`

### 2. Missing APP_BASE_URL environment variable
**Scenario:** Env var not configured in wrangler.jsonc or .dev.vars

**Handling:** Function receives empty string or undefined, generates invalid URL
**Impact:** QR code will encode malformed URL (e.g., `undefined/search/ABC123`)

**Mitigation:**
- Document APP_BASE_URL as required in PR description
- T-13 should validate `env.APP_BASE_URL` exists before calling
- Consider adding validation in `generateEventQR()`:
  ```typescript
  if (!baseUrl || !baseUrl.startsWith("http")) {
    throw new Error("Invalid baseUrl: must be a valid HTTP(S) URL");
  }
  ```

### 3. QR generation fails (library error)
**Scenario:** `@juit/qrcode` throws unexpected error (unlikely, but possible)

**Handling:** Error bubbles up to caller (T-13), logged by Sentry
**Impact:** Event creation fails, user sees 500 error

**Mitigation:** T-13 should wrap in try-catch and provide user-friendly error

### 4. QR not scannable in real-world conditions
**Scenario:** Generated QR works in tests but fails to scan on printed materials

**Root causes:**
- Print quality too low (resolution, printer DPI)
- QR too small (< 2cm)
- Low contrast (faded print)
- Dirty/damaged surface

**Mitigation:**
- Error correction level "M" provides 15% resilience (decision confirmed)
- Margin of 4 modules ensures quiet zone
- Document minimum print size in photographer onboarding
- If issues arise, can upgrade to error correction "Q" (25%) in follow-up

### 5. URL length exceeds QR capacity
**Scenario:** Very long baseUrl + accessCode exceeds QR limits

**Analysis:**
- Max URL: `https://staging.sabaipics.com/search/ABC123` = ~46 chars
- QR capacity (Version 1, M level): ~14 alphanumeric chars (NOT ENOUGH)
- QR capacity (Version 3, M level): ~53 alphanumeric chars (sufficient)
- `@juit/qrcode` auto-selects QR version based on content length

**Impact:** Library will auto-select larger QR version, no failure expected
**Mitigation:** None needed (library handles this automatically)

## Validation plan

### Tests to add

**Unit tests (automated):**
- ✅ Valid access code generates PNG Uint8Array
- ✅ PNG magic bytes verification (89 50 4E 47)
- ✅ Different codes generate different PNGs
- ✅ Lowercase characters rejected
- ✅ Special characters rejected
- ✅ Wrong length rejected (too short, too long, empty)

**Integration tests (manual for MVP):**
- ✅ Generate QR in Workers environment (if time permits, use `@cloudflare/vitest-pool-workers`)
- ✅ Manual scannability test (see below)

### Commands to run

```bash
# Install dependency
pnpm --filter=@sabaipics/api add @juit/qrcode

# Type check
pnpm check-types

# Run tests
pnpm --filter=@sabaipics/api test

# Build API
pnpm --filter=@sabaipics/api build

# Build all (ensure no workspace-level breaks)
pnpm build
```

### Manual scannability checklist

**Required before marking T-14 complete:**

1. **Generate test QR:**
   ```typescript
   // In Vitest test or dev script
   import { generateEventQR } from "./src/lib/qr";
   import { writeFileSync } from "fs";

   const png = await generateEventQR("TEST01", "https://sabaipics.com");
   writeFileSync("test-qr.png", png);
   ```

2. **Scan tests:**
   - [ ] iPhone camera app (iOS 15+)
   - [ ] LINE in-app scanner
   - [ ] Android Chrome camera (if available)
   - [ ] Verify URL is correct: `https://sabaipics.com/search/TEST01`

3. **Print test (optional for T-14, required before T-13 merge):**
   - [ ] Print QR at business card size (~5cm x 5cm)
   - [ ] Scan printed version from 30cm distance
   - [ ] Verify readability

**Acceptance criteria:** QR must scan successfully with at least 2 out of 3 device types.

## Rollout / rollback

### Rollout (T-14)
- T-14 introduces library only, no user-facing changes
- No database migrations
- No API endpoints
- Risk: **Very low** (pure utility, no side effects)

### Rollout (T-13 integration)
T-13 will integrate this library for event creation:
- QR generation happens synchronously during `POST /events`
- Expected latency: < 100ms per QR (acceptable for event creation)
- Storage: R2 (`qr/{eventId}.png`)
- Rollback: If QR generation fails, event creation should still succeed (optional QR)

### Environment configuration
**Required before T-13 merge:**
- Add `APP_BASE_URL` to production `wrangler.jsonc`
- Add `APP_BASE_URL` to staging `wrangler.jsonc` (if exists)
- Verify `.dev.vars` has `APP_BASE_URL=http://localhost:5173`

**Rollback:** If QR generation causes issues in production:
1. Option A: Disable QR generation in T-13 (make it optional/skippable)
2. Option B: Revert T-13 PR (does not affect T-14 library code)
3. Option C: Fix forward (adjust error correction, validation, etc.)

### Monitoring
- No specific monitoring for T-14 (library code)
- T-13 will add Sentry spans for QR generation operations
- Check Sentry for errors after T-13 deployment:
  - `generateEventQR` errors (validation failures, library errors)
  - R2 upload errors (separate from T-14)

## Open questions

**All open questions resolved via HI gate (user decisions):**

✅ **QR Encoding Strategy** - Decision: Search URL only (slideshow is separate UI feature)

✅ **APP_BASE_URL Configuration** - Decision: Environment variable

✅ **Error Correction Level** - Decision: M (Medium 15%)

✅ **Access Code Format** - Decision: 6-char uppercase A-Z0-9

**No remaining blockers.**
