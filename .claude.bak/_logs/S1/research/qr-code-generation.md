# QR Code Generation in Cloudflare Workers - Research

## Executive Summary

**Recommended Library: `@juit/qrcode`**
- Zero dependencies, no Node.js APIs required
- Native PNG output (returns `Uint8Array`)
- Directly compatible with Cloudflare Workers
- TypeScript support

---

## 1. Library Comparison

| Library | Workers Compatible | Output | Dependencies |
|---------|-------------------|--------|--------------|
| **@juit/qrcode** | Yes | PNG, SVG | None |
| qrcode-svg | Yes | SVG only | None |
| @sigmasd/qrpng | Yes (JSR) | PNG | None |
| qrcode (node-qrcode) | No | N/A | Canvas API |
| qr-image | No | N/A | Node.js |

---

## 2. Implementation

### Hono Route Handler

```typescript
import { Hono } from "hono";
import { generatePngQrCode } from "@juit/qrcode";

const qrRouter = new Hono();

qrRouter.get("/events/:eventCode/qr", async (c) => {
  const eventCode = c.req.param("eventCode");
  const baseUrl = c.env.APP_URL || "https://app.sabaipics.com";
  const qrUrl = `${baseUrl}/e/${eventCode}`;

  try {
    const pngBytes = await generatePngQrCode(qrUrl, {
      ecLevel: "M",  // 15% error correction (balanced)
      margin: 4,
      scale: 1,
    });

    return c.body(pngBytes, 200, {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="qr-${eventCode}.png"`,
      "Cache-Control": "public, max-age=86400",
    });
  } catch (error) {
    console.error("QR generation failed:", error);
    return c.json({ error: "Failed to generate QR code" }, 500);
  }
});

export { qrRouter };
```

---

## 3. Storage Strategy

**Recommendation: On-Demand Generation with HTTP Caching**

- Generate on-demand (< 5ms per request)
- Use `Cache-Control: public, max-age=86400` for 24-hour edge caching
- No R2 storage needed for QR codes

**Alternative for High-Traffic Events:**
```typescript
// Check R2 cache first
const cached = await env.PHOTOS_BUCKET.get(`qr/${eventCode}.png`);
if (cached) {
  return c.body(await cached.arrayBuffer(), 200, {
    "Content-Type": "image/png"
  });
}

// Generate and cache
const pngBytes = await generatePngQrCode(qrUrl);
await env.PHOTOS_BUCKET.put(`qr/${eventCode}.png`, pngBytes);
return c.body(pngBytes, 200, { "Content-Type": "image/png" });
```

---

## 4. Configuration

### Error Correction Levels
- `L` (7%): Minimal, smaller QR
- `M` (15%): **Recommended** - good balance
- `Q` (25%): Higher reliability for printing
- `H` (30%): Maximum resilience

### URL Format
- Pattern: `https://app.sabaipics.com/e/{eventCode}`
- Length: ~35-50 characters (well within QR capacity of 4,296)

---

## 5. Package Installation

```bash
pnpm add @juit/qrcode
```

---

## 6. Testing

```typescript
import { test, expect } from "vitest";
import { generatePngQrCode } from "@juit/qrcode";

test("generates valid PNG", async () => {
  const png = await generatePngQrCode("https://app.sabaipics.com/e/ABC123");
  expect(png).toBeInstanceOf(Uint8Array);
  expect(png[0]).toBe(0x89); // PNG magic number
});
```

---

## Implementation Checklist

1. [ ] Install `@juit/qrcode` package
2. [ ] Create QR route handler
3. [ ] Add to event API routes
4. [ ] Test PNG generation
5. [ ] Verify mobile scanner compatibility
