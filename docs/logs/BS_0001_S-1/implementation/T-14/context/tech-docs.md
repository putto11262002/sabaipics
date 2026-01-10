# Tech Docs Scout Report

Task: T-14
Root: BS_0001_S-1
Date: 2026-01-10

## Must-follow conventions

### API surface
- **Framework:** Hono ^4.10.7 on Cloudflare Workers (compatibility_date: 2025-12-06)
- **Runtime:** Cloudflare Workers with `nodejs_compat` flag enabled
- **Module pattern:** Create utility functions in `apps/api/src/lib/qr/` directory
- **Export pattern:** Named exports for reusable functions
- **Response format:** Functions should return typed results (e.g., `Uint8Array` for binary data)
- **Error handling:** Throw descriptive errors that can be caught by route handlers
- **Validation:** Use Zod for any options/config validation if needed

### Dependencies
- **Package manager:** pnpm (workspace monorepo)
- **Installation command:** `pnpm --filter=@sabaipics/api add <package>`
- **Approved library:** `@juit/qrcode` (researched and validated for Workers compatibility)
- **Version pinning:** Use exact or caret versions (^) as per existing pattern
- **Zero native dependencies:** Must work without Node.js native modules (Canvas, etc.)
- **Bundle size awareness:** Workers have 10MB compressed limit (paid plan), 3MB (free plan)
- **Tree-shaking:** Prefer libraries with tree-shakable exports

### Testing
- **Test framework:** Vitest ^3.2.0 with `@cloudflare/vitest-pool-workers` ^0.10.14
- **Test location:** Co-located with source: `apps/api/src/lib/qr/generate.test.ts`
- **Test configuration:** Use `vitest.node.config.ts` for unit tests (include: `src/**/*.test.ts`)
- **Test pattern:** 
  - Unit tests for QR generation logic
  - Test different URL formats
  - Test error cases (invalid input)
  - Verify output is Uint8Array
  - Verify QR is scannable (validate structure, not actual scanning)
- **Mock patterns:** Mock external services if needed, but QR generation is self-contained
- **Coverage target:** 90% for business logic

### Security
- **Input validation:** Validate access code format before generating QR
- **URL generation:** Use environment variable for base URL (not hardcoded)
- **No PII in QR codes:** QR contains only access codes (public identifiers)
- **Output sanitization:** No need (PNG binary output)
- **Error messages:** Don't expose internal paths or secrets in errors
- **Audit logging:** Not required for QR generation (event creation is logged)

### Observability
- **Tracing:** Use Sentry spans for QR generation operations
  ```typescript
  Sentry.startSpan({ op: 'qr.generate', name: 'Generate event QR' }, async () => {
    // QR generation logic
  });
  ```
- **Error tracking:** Errors bubble up to Sentry via route handlers
- **Contextual data:** Add tags for event_id, photographer_id when called from routes
- **Performance targets:** < 100ms for QR generation (acceptable latency for event creation)
- **No metrics needed:** QR generation is part of event creation (tracked at route level)

## Repo-specific patterns

### Library wrapper pattern
Create a clean abstraction layer in `apps/api/src/lib/qr/generate.ts`:

```typescript
import { generatePngQrCode } from "@juit/qrcode";

export interface GenerateEventQROptions {
  accessCode: string;
  baseUrl: string;  // from env variable
  ecLevel?: "L" | "M" | "Q" | "H";  // default: "M"
  margin?: number;  // default: 4
}

export async function generateEventQR(
  options: GenerateEventQROptions
): Promise<Uint8Array> {
  const { accessCode, baseUrl, ecLevel = "M", margin = 4 } = options;
  
  // Construct URLs (search + slideshow)
  const searchUrl = `${baseUrl}/search/${accessCode}`;
  const slideshowUrl = `${baseUrl}/slideshow/${accessCode}`;
  const content = `Search: ${searchUrl}\nSlideshow: ${slideshowUrl}`;
  
  // Generate QR
  const pngBytes = await generatePngQrCode(content, { ecLevel, margin });
  
  return pngBytes;
}
```

### Integration with event creation route
The QR generation will be called from `POST /events` endpoint:

```typescript
// In apps/api/src/routes/events.ts
import { generateEventQR } from "../lib/qr/generate";

export const eventsRouter = new Hono<Env>()
  .post("/", requirePhotographer(), async (c) => {
    const env = c.env;
    const photographer = c.var.photographer;
    const db = c.var.db();
    
    // ... event creation logic
    
    // Generate QR
    const qrPng = await generateEventQR({
      accessCode: event.accessCode,
      baseUrl: env.APP_BASE_URL  // from environment
    });
    
    // Upload to R2
    const qrKey = `qr/${event.id}.png`;
    await env.PHOTOS_BUCKET.put(qrKey, qrPng, {
      httpMetadata: { contentType: "image/png" }
    });
    
    // Update event with QR R2 key
    await db.update(events)
      .set({ qrCodeR2Key: qrKey })
      .where(eq(events.id, event.id));
    
    return c.json({ data: event }, 201);
  });
```

### Environment configuration
Add to `wrangler.jsonc` (vars section):

```json
{
  "vars": {
    "APP_BASE_URL": "https://sabaipics.com"
  }
}
```

And to `.dev.vars` for local development:

```
APP_BASE_URL=http://localhost:5173
```

### R2 storage pattern
- **Bucket:** Use existing `PHOTOS_BUCKET` binding
- **Key pattern:** `qr/{eventId}.png` (consistent with photo storage pattern)
- **Content-Type:** `image/png` (set in httpMetadata)
- **Public access:** Not needed (serve via signed URL from API)

### Type definitions
Location: `apps/api/src/types.ts`

Add to Bindings type if needed:

```typescript
export type Bindings = CloudflareBindings & {
  APP_BASE_URL: string;
  // ... existing bindings
};
```

### File structure
```
apps/api/src/lib/qr/
├── generate.ts          # Main QR generation function
├── generate.test.ts     # Unit tests
└── index.ts             # Re-export for clean imports
```

## Gaps / clarifications needed

### [RESOLVED] QR content format
**Question:** Should QR contain two separate URLs or a single landing page that shows both options?

**Resolution from research:** Research document `qr-code-library.md` shows "QR contains both search and slideshow URLs" - this suggests embedding both URLs in the QR content. The implementation above uses a multi-line format.

**Recommendation:** Use multi-line format:
```
Search: https://sabaipics.com/search/{code}
Slideshow: https://sabaipics.com/slideshow/{code}
```

Most QR scanners will show both URLs and let user choose, or auto-open the first one.

### [RESOLVED] Error correction level
**Question:** Which error correction level for printable QR codes?

**Resolution from research:** Research recommends "M (15%): Balanced (recommended)" with note "unless photographers request higher".

**Recommendation:** Start with "M", add option to upgrade to "Q" (25%) if photographers report scanning issues with printed materials.

### [RESOLVED] QR generation timing
**Question:** Generate on event creation (eager) or on-demand (lazy)?

**Resolution from research:** Research recommends "Eager (store in R2) for simplicity and offline access".

**Recommendation:** Generate during `POST /events` synchronously. 100ms latency is acceptable for event creation operation.

### [CLARIFICATION NEEDED] URL format for participant views
**Gap:** The search and slideshow URLs are referenced but not yet implemented in the codebase.

**Impact:** Medium - QR will contain these URLs but they won't work until participant UI is built.

**Recommendation:** Use placeholder URLs for now, ensure they're environment-configurable so they can be updated when participant UI is ready. Consider adding a TODO comment in code.

## References

### Primary docs
- Architecture: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/tech/ARCHITECTURE.md`
- Tech Stack: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/tech/TECH_STACK.md`
- API Design: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/deprecated/tech/03_api_design.md`
- Testing Strategy: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/deprecated/tech/09_testing.md`
- Security Design: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/deprecated/tech/08_security.md`
- Observability: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/deprecated/tech/07_observability.md`

### Research
- QR Library Research: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/logs/BS_0001_S-1/research/qr-code-library.md`

### Task context
- Tasks: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/logs/BS_0001_S-1/tasks.md`
- T-14 Specification: Lines 347-365 in tasks.md

### Similar implementations (for pattern reference)
- T-7 Tech Docs: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/logs/BS_0001_S-1/implementation/T-7/context/tech-docs.md`

### External documentation
- @juit/qrcode npm: https://www.npmjs.com/package/@juit/qrcode
- @juit/qrcode GitHub: https://github.com/juitnow/juit-qrcode
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare R2 API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
