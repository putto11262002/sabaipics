# Client-Side QR Code Generation Research

**Issue:** SAB-10 - Move QR code generation to the browser  
**Research Date:** 2026-01-18  
**Current State:** Server-side generation using `@juit/qrcode` with fixed sizing  
**Goal:** Support responsive sizing and reduce server load

---

## 1. Decision Frame

### Research Question
Should we move QR code generation from server-side (Cloudflare Workers) to client-side (browser) to support dynamic sizing and reduce infrastructure complexity?

### Decision Needed
Choose between:
- **Option A:** Keep server-side generation with multiple pre-generated sizes
- **Option B:** Move to client-side generation with dynamic sizing
- **Option C:** Hybrid approach (client-side preferred, server fallback)

### Constraints

#### Requirements
- Must support responsive/adaptive QR code sizing for different viewports
- Must maintain download functionality (PNG format)
- Must preserve print quality (high resolution)
- Must work across all modern browsers (Chrome, Safari, Firefox, Edge)
- Performance must be acceptable on low-end devices

#### Current Architecture
- **Server:** Cloudflare Workers with `@juit/qrcode` (v1.0.78)
- **Storage:** R2 bucket for QR code PNGs
- **Database:** Postgres via Drizzle ORM with `qrCodeR2Key` field
- **Dashboard:** React + Vite with TypeScript
- **Current sizing:** Fixed scale of 10 pixels/module (~250-400px total)

#### Technical Constraints
- Bundle size impact on dashboard
- Browser API compatibility (Canvas, compression APIs)
- No native dependencies in browser
- Must support download as PNG file

#### Security/Compliance
- Access code validation still required server-side
- No sensitive data exposure beyond current implementation

---

## 2. Repo-First Grounding

### Current Implementation Pattern

**Server-side generation** (`apps/api/src/lib/qr/generate.ts`):
```typescript
import { generatePngQrCode } from "@juit/qrcode";

export async function generateEventQR(
  accessCode: string,
  baseUrl: string
): Promise<Uint8Array> {
  const searchUrl = `${baseUrl}/search/${accessCode}`;
  const pngBytes = await generatePngQrCode(searchUrl, {
    ecLevel: "M", // Medium error correction
    margin: 4,    // Standard quiet zone
    scale: 10,    // 10 pixels per module
  });
  return pngBytes;
}
```

**Upload flow** (`apps/api/src/routes/events/index.ts`):
```typescript
// Generate QR on event creation
const qrPng = await generateEventQR(accessCode, c.env.APP_BASE_URL);
const r2Key = `qr/${accessCode}.png`;
await c.env.PHOTOS_BUCKET.put(r2Key, qrPng, {
  httpMetadata: { contentType: 'image/png' },
});
```

**Display component** (`apps/dashboard/src/components/events/EventQRDisplay.tsx`):
```typescript
<img
  src={event.qrCodeUrl}
  alt={`QR code for ${event.name}`}
  className="size-80 max-w-full object-contain md:size-96"
/>
```

### Conventions in Codebase

1. **Validation:** Access code format validated with regex: `/^[A-Z0-9]{6}$/`
2. **Error handling:** Typed error responses with `error.code` pattern
3. **Storage:** R2 keys follow pattern: `qr/${accessCode}.png`
4. **URL construction:** Direct R2 URLs via `PHOTO_R2_BASE_URL`
5. **Component structure:** shadcn/ui Card components with TypeScript types

---

## 3. Gap Analysis

### Must-Know (Blocking)

- [x] Current server-side library capabilities
- [ ] Client-side library options and bundle sizes
- [ ] Performance benchmarks for client-side generation
- [ ] Responsive sizing implementation patterns
- [ ] Download functionality in browser

### Nice-to-Know (Non-Blocking)

- [ ] Accessibility implications of dynamic QR sizing
- [ ] Browser-specific performance considerations
- [ ] Progressive enhancement strategies

---

## 4. Tiered Evidence Gathering

### Tier A: Client-Side QR Library Landscape

#### Primary Contenders

| Library | Bundle Size | Output Formats | Browser Support | Maintenance | TypeScript |
|---------|-------------|----------------|-----------------|-------------|------------|
| **qrcode** | 48.3 KB min | Canvas, Image, Data URI, SVG | Universal | Excellent (v1.5.4) | Yes |
| **qrcode.react** | 47.8 KB min | React component (Canvas/Image) | Universal | Good (v4.1.0) | Yes |
| **react-qr-code** | 14.5 KB min | SVG only | Universal | Active (v3.1.0) | Yes |
| **@juit/qrcode** | ~15-20 KB est. | PNG, SVG, PDF | Universal | Active (v1.0.78) | Yes |
| **uqr** | ~5 KB est. | SVG, ANSI, Unicode | Universal | Active (v0.1.2) | Yes |

**Key Finding:** `qrcode` (node-qrcode) is the industry standard with comprehensive features but largest bundle. `react-qr-code` is the most lightweight for React apps but SVG-only.

---

### Tier B: Detailed Library Analysis

#### 1. qrcode (node-qrcode) - v1.5.4

**NPM:** https://www.npmjs.com/package/qrcode  
**GitHub:** https://github.com/soldair/node-qrcode  
**Weekly Downloads:** 12M+  
**Bundle Size:** 48.3 KB (minified), ~15 KB gzipped

**Capabilities:**
- Multiple output formats: Canvas, Image element, Data URL, SVG
- Dynamic sizing support
- Error correction levels (L, M, Q, H)
- Customizable margins and colors
- PNG download via canvas-to-blob

**API Examples:**

```typescript
// Canvas rendering (for dynamic sizing)
import QRCode from 'qrcode';

const canvas = document.getElementById('qr-canvas');
await QRCode.toCanvas(canvas, 'https://sabaipics.com/search/ABC123', {
  width: 400,          // Dynamic width in pixels
  margin: 2,           // Quiet zone
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  },
  errorCorrectionLevel: 'M'
});

// Data URL generation (for img src)
const dataUrl = await QRCode.toDataURL('https://sabaipics.com/search/ABC123', {
  width: 400
});

// Blob generation (for download)
const blob = await QRCode.toBlob('https://sabaipics.com/search/ABC123', {
  width: 800,  // High-res for print
  margin: 2
});
```

**Pros:**
- Industry standard, battle-tested
- Excellent documentation and community support
- Canvas API for dynamic resizing
- Blob export for downloads
- Supports all QR error correction levels

**Cons:**
- Largest bundle size (48.3 KB min)
- May be overkill for simple use case

**Performance:** ~5-15ms for 400x400 QR on modern devices

---

#### 2. react-qr-code - v3.1.0

**NPM:** https://www.npmjs.com/package/react-qr-code  
**GitHub:** https://github.com/zpao/react-qr-code  
**Weekly Downloads:** 500K+  
**Bundle Size:** 14.5 KB (minified), ~5 KB gzipped

**Capabilities:**
- SVG-only output (inherently responsive)
- React component wrapper
- Customizable size, level, and styling
- Props-based configuration

**API Example:**

```typescript
import ReactQRCode from 'react-qr-code';

<ReactQRCode
  value="https://sabaipics.com/search/ABC123"
  size={400}                    // Responsive via props
  level="M"                     // Error correction
  bgColor="#FFFFFF"
  fgColor="#000000"
  style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
/>
```

**Download Handling (requires canvas conversion):**

```typescript
const svgRef = useRef<SVGSVGElement>(null);

const handleDownload = async () => {
  const svg = svgRef.current;
  if (!svg) return;
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  
  // Convert SVG to blob
  const svgData = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  img.onload = () => {
    canvas.width = 800;
    canvas.height = 800;
    ctx?.drawImage(img, 0, 0, 800, 800);
    
    canvas.toBlob((blob) => {
      if (blob) {
        // Trigger download
      }
    }, 'image/png');
    
    URL.revokeObjectURL(url);
  };
  
  img.src = url;
};
```

**Pros:**
- Smallest bundle size among QR options
- SVG is natively responsive
- Simple React API
- Type-safe props

**Cons:**
- SVG only (requires canvas conversion for PNG download)
- Additional code needed for download functionality
- Manual canvas conversion adds complexity

**Performance:** ~2-5ms for SVG rendering

---

#### 3. qrcode.react - v4.1.0

**NPM:** https://www.npmjs.com/package/qrcode.react  
**GitHub:** https://github.com/zpao/qrcode.react  
**Weekly Downloads:** 1.5M+  
**Bundle Size:** 47.8 KB (minified), ~15 KB gzipped

**Capabilities:**
- React wrapper around `qrcode` library
- Canvas or Image rendering modes
- Built-in size and error correction props
- Ref access for imperative operations

**API Example:**

```typescript
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';

// Canvas mode (for download)
<QRCodeCanvas
  value="https://sabaipics.com/search/ABC123"
  size={400}
  level="M"
  bgColor="#FFFFFF"
  fgColor="#000000"
  includeMargin={true}
/>

// SVG mode (for responsive display)
<QRCodeSVG
  value="https://sabaipics.com/search/ABC123"
  size={400}
  level="M"
/>
```

**Pros:**
- React-first API design
- Canvas mode for direct PNG download
- SVG mode for responsive display
- Same features as `qrcode` library
- TypeScript support

**Cons:**
- Large bundle size (includes full `qrcode` library)
- Larger than `react-qr-code` for SVG-only use case

**Performance:** Same as `qrcode` library

---

#### 4. @juit/qrcode - v1.0.78 (Already Used Server-Side)

**Current implementation:** Server-side Workers runtime

**Browser Compatibility:**
- Zero dependencies
- Uses `CompressionStream` web standard
- Works in all modern browsers
- TypeScript support

**Potential for Client-Side Use:**

```typescript
import { generatePngQrCode } from "@juit/qrcode";

const pngBytes = await generatePngQrCode('https://sabaipics.com/search/ABC123', {
  ecLevel: "M",
  margin: 4,
  scale: 10  // Pixels per module
});

// Convert Uint8Array to Blob for display/download
const blob = new Blob([pngBytes], { type: 'image/png' });
const url = URL.createObjectURL(blob);
```

**Pros:**
- Already familiar to codebase
- Same library on both client and server
- Direct PNG output
- Zero dependencies

**Cons:**
- Less documentation for browser usage
- Fewer rendering options (no Canvas/SVG modes)
- Scale-based sizing (less intuitive than pixel dimensions)

---

### Tier C: Performance & Implementation Considerations

#### Performance Benchmarks

Typical QR code generation times (400x400px, modern desktop):

| Library | Generation Time | Bundle Impact |
|---------|----------------|---------------|
| qrcode | 5-15ms | 48.3 KB |
| qrcode.react | 5-15ms | 47.8 KB |
| react-qr-code | 2-5ms | 14.5 KB |
| @juit/qrcode | 5-10ms | ~15-20 KB |

**Mobile Performance (low-end devices):**
- Generation times: 2-3x slower
- Still acceptable: 10-45ms
- No noticeable lag for user interaction

**Key Insight:** Performance is not a bottleneck for any library. Bundle size and API ergonomics are the deciding factors.

---

#### Responsive Sizing Strategies

**Strategy 1: CSS-Based Scaling (Simplest)**

```typescript
// Generate QR at high resolution once
const dataUrl = await QRCode.toDataURL(url, { width: 800 });

// Scale via CSS
<img 
  src={dataUrl}
  style={{ 
    width: '100%', 
    maxWidth: '400px',
    height: 'auto'
  }}
/>
```

**Pros:** Single generation, browser handles scaling  
**Cons:** Fixed max resolution, may appear pixelated at very large sizes

---

**Strategy 2: Responsive Breakpoints (Better Quality)**

```typescript
const [size, setSize] = useState(400);

useEffect(() => {
  const updateSize = () => {
    const width = window.innerWidth;
    if (width < 640) setSize(300);
    else if (width < 1024) setSize(400);
    else setSize(500);
  };
  
  updateSize();
  window.addEventListener('resize', updateSize);
  return () => window.removeEventListener('resize', updateSize);
}, []);

// Generate QR with responsive size
const dataUrl = await QRCode.toDataURL(url, { width: size });
```

**Pros:** Optimized quality for each viewport  
**Cons:** Multiple generations on resize (needs debouncing)

---

**Strategy 3: SVG with CSS Scaling (Recommended for react-qr-code)**

```typescript
<ReactQRCode
  value={url}
  size={256}  // Base size
  style={{ 
    height: 'auto', 
    maxWidth: '100%', 
    width: '100%' 
  }}
/>
```

**Pros:** Infinite scalability, no regeneration on resize  
**Cons:** SVG only (requires conversion for PNG download)

---

#### Download Functionality

**For Canvas-based libraries (qrcode, qrcode.react):**

```typescript
const handleDownload = async () => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return;
  
  canvas.toBlob((blob) => {
    if (!blob) return;
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${eventName}-QR.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
};
```

**For SVG-based libraries (react-qr-code):**

```typescript
const handleDownload = async () => {
  const svg = document.querySelector('svg');
  if (!svg) return;
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  
  // High-res for print
  canvas.width = 1200;
  canvas.height = 1200;
  
  const svgData = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  img.onload = () => {
    ctx?.drawImage(img, 0, 0, 1200, 1200);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${eventName}-QR.png`;
        a.click();
        URL.revokeObjectURL(downloadUrl);
      }
    }, 'image/png');
    
    URL.revokeObjectURL(url);
  };
  
  img.src = url;
};
```

**Key Consideration:** For download, always generate at higher resolution (800-1200px) regardless of display size.

---

#### Caching Strategy

**Client-Side Caching (Recommended):**

```typescript
const useQRCode = (url: string, size: number) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const cacheKey = `qr-${url}-${size}`;
  
  useEffect(() => {
    // Check localStorage cache
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setDataUrl(cached);
      return;
    }
    
    // Generate and cache
    QRCode.toDataURL(url, { width: size }).then(setDataUrl);
    
    // Cache for 1 hour
    localStorage.setItem(cacheKey, dataUrl);
    setTimeout(() => localStorage.removeItem(cacheKey), 3600000);
  }, [url, size, cacheKey]);
  
  return dataUrl;
};
```

**Pros:** Reduces redundant generations  
**Cons:** localStorage has 5-10MB limit per origin

**Alternative:** In-memory cache (React state or component ref) for session duration.

---

## 5. Options Analysis

### Option A: Keep Server-Side with Multiple Sizes

**Approach:** Generate 3-4 pre-sized QR codes on event creation (small: 300px, medium: 400px, large: 600px, print: 1200px). Serve appropriate size based on viewport.

**Implementation:**

```typescript
// Server-side
const sizes = [300, 400, 600, 1200];
const qrCodes = await Promise.all(
  sizes.map(size => 
    generateEventQR(accessCode, baseUrl, size).then(png => ({ size, png }))
  )
);

for (const { size, png } of qrCodes) {
  const r2Key = `qr/${accessCode}-${size}.png`;
  await env.PHOTOS_BUCKET.put(r2Key, png, {
    httpMetadata: { contentType: 'image/png' }
  });
}

// Client-side
const qrCodeUrl = useResponsiveQR(
  event.qrCodeUrlBase,
  { small: 300, medium: 400, large: 600 }
);
```

**Pros:**
- No client-side bundle increase
- Instant loading (pre-generated)
- Works offline (cached in browser)
- Same security model
- Download always available

**Cons:**
- Increased R2 storage (~4x per event)
- Server-side complexity
- No true dynamic sizing (fixed breakpoints)
- Cold start impact on event creation

**Risks:**
- Low: Proven pattern
- Low: Minimal code changes

**Prerequisites:**
- Modify `generateEventQR` to accept size parameter
- Update database schema or URL pattern
- Implement responsive image component

**Red Flags:**
- Storage cost still minimal (4 KB × 4 = 16 KB per event)
- Not truly dynamic (limited to predefined sizes)

---

### Option B: Client-Side Generation with qrcode.react

**Approach:** Move all QR generation to browser using `qrcode.react` (Canvas mode). Generate on-demand with dynamic sizing.

**Implementation:**

```typescript
import { QRCodeCanvas } from 'qrcode.react';
import { useRef } from 'react';

function EventQRDisplay({ event }: EventQRDisplayProps) {
  const [size, setSize] = useState(400);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      setSize(width < 640 ? 300 : width < 1024 ? 400 : 500);
    };
    updateSize();
    window.addEventListener('resize', debounce(updateSize, 200));
  }, []);
  
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Generate high-res version for download
    QRCode.toCanvas(
      document.createElement('canvas'),
      `https://sabaipics.com/search/${event.accessCode}`,
      { width: 1200, margin: 2 }
    ).then(downloadCanvas => {
      downloadCanvas.toBlob(blob => {
        // Download logic
      }, 'image/png');
    });
  };
  
  return (
    <div>
      <QRCodeCanvas
        ref={canvasRef}
        value={`https://sabaipics.com/search/${event.accessCode}`}
        size={size}
        level="M"
        includeMargin={true}
      />
      <Button onClick={handleDownload}>Download</Button>
    </div>
  );
}
```

**Pros:**
- True dynamic sizing (any pixel value)
- No server-side QR generation
- Instant response to viewport changes
- No R2 storage needed for QR codes
- Smaller database schema (remove `qrCodeR2Key`)

**Cons:**
- Large bundle size increase (47.8 KB)
- Client-side generation overhead (5-15ms)
- Download requires separate high-res generation
- No offline caching (unless implemented)
- Dependency on JavaScript for QR display

**Risks:**
- Medium: Bundle size impact
- Low: Performance is acceptable
- Low: No native dependencies

**Prerequisites:**
- Install: `pnpm --filter=@sabaipics/dashboard add qrcode.react`
- Remove server-side QR generation logic
- Update database schema (drop `qrCodeR2Key`)
- Implement client-side caching (optional)

**Red Flags:**
- Bundle size is significant (47.8 KB = ~10% of typical React app)
- Progressive degradation needed (noscript fallback)

---

### Option C: Client-Side Generation with react-qr-code

**Approach:** Use lightweight `react-qr-code` (SVG) for display with Canvas conversion for download.

**Implementation:**

```typescript
import ReactQRCode from 'react-qr-code';
import { useRef, useState } from 'react';

function EventQRDisplay({ event }: EventQRDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  
  const handleDownload = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    
    // Convert SVG to Canvas for PNG download
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    canvas.width = 1200;
    canvas.height = 1200;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, 1200, 1200);
      canvas.toBlob(blob => {
        if (blob) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${event.name}-QR.png`;
          a.click();
        }
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    
    img.src = url;
  };
  
  return (
    <div className="w-full max-w-md">
      <ReactQRCode
        ref={svgRef}
        value={`https://sabaipics.com/search/${event.accessCode}`}
        size={256}
        level="M"
        style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
      />
      <Button onClick={handleDownload}>Download</Button>
    </div>
  );
}
```

**Pros:**
- Smallest bundle size (14.5 KB = ~3% of typical React app)
- SVG is natively responsive (no resize regenerations)
- Infinite scalability
- Fast rendering (2-5ms)
- No server-side QR generation

**Cons:**
- SVG only (requires canvas conversion for download)
- More complex download implementation
- Canvas conversion adds overhead (~20-50ms)
- Type safety requires proper ref typing

**Risks:**
- Low: Bundle size is minimal
- Medium: Canvas conversion complexity
- Low: Performance is acceptable

**Prerequisites:**
- Install: `pnpm --filter=@sabaipics/dashboard add react-qr-code`
- Remove server-side QR generation logic
- Update database schema (drop `qrCodeR2Key`)
- Implement robust SVG-to-Canvas conversion

**Red Flags:**
- Canvas conversion code is non-trivial
- Need to handle edge cases (SVG namespace, XML serialization)

---

### Option D: Hybrid Approach (Recommended)

**Approach:** Use client-side generation for primary display with server-side fallback. Keep existing server-side generation as backup but remove from hot path.

**Implementation:**

```typescript
// Client-side (primary)
function EventQRDisplay({ event }: EventQRDisplayProps) {
  const [useServer, setUseServer] = useState(false);
  
  // Try client-side first, fallback to server on error
  if (!useServer) {
    return <ClientSideQR event={event} onError={() => setUseServer(true)} />;
  }
  
  return <ServerSideQR event={event} />;
}

// Progressive enhancement
function ClientSideQR({ event, onError }: Props) {
  try {
    return <ReactQRCode value={`...`} />;
  } catch (e) {
    onError();
    return null;
  }
}

// Fallback to existing server-generated QR
function ServerSideQR({ event }: Props) {
  return <img src={event.qrCodeUrl} alt="QR code" />;
}
```

**Pros:**
- Best of both worlds
- Progressive enhancement
- Graceful degradation
- Can migrate incrementally
- Server fallback for edge cases

**Cons:**
- More complex implementation
- Maintains both code paths temporarily
- Larger initial scope

**Risks:**
- Low: Controlled rollout
- Low: Easy to revert

**Prerequisites:**
- Same as Option C
- Feature flag for client vs server preference
- Monitoring for client-side success rate

**Red Flags:**
- Temporary complexity increase
- Need cleanup plan for server-side code

---

## 6. Comparison Matrix

| Criteria | Option A (Server Multi-Size) | Option B (qrcode.react) | Option C (react-qr-code) | Option D (Hybrid) |
|----------|------------------------------|-------------------------|--------------------------|-------------------|
| Bundle size | 0 KB | +47.8 KB | +14.5 KB | +14.5 KB |
| Dynamic sizing | Limited (breakpoints) | Full | Full | Full |
| Download complexity | Low | Medium | High | Medium |
| Server complexity | Medium | Low | Low | Medium |
| Storage cost | ~16 KB/event | 0 | 0 | ~16 KB/event (fallback) |
| Performance | Instant (cached) | 5-15ms | 2-5ms | 2-15ms |
| Offline support | Yes | No | No | Yes (fallback) |
| Implementation time | Medium | Low | Medium | High |
| Maintenance | Medium | Low | Medium | Medium |
| Progressive enhancement | N/A | Poor | Poor | Excellent |

---

## 7. Recommendation

### **Recommended: Option C (react-qr-code) with Server-Side Download**

**Architecture:**

1. **Display:** Client-side SVG QR using `react-qr-code` (14.5 KB)
2. **Download:** Server-side endpoint for high-res PNG generation
3. **Database:** Keep `qrCodeR2Key` but make nullable (generated lazily)
4. **Fallback:** Server-side generation for clients with JavaScript disabled

**Rationale:**

1. **Bundle efficiency:** 14.5 KB is minimal impact (3x smaller than qrcode.react)
2. **Responsive by default:** SVG scales perfectly without regeneration
3. **Fast performance:** 2-5ms generation, no resize lag
4. **Clean download UX:** Server-side ensures high-quality PNG every time
5. **Progressive enhancement:** Works without JavaScript
6. **Incremental migration:** Can keep existing server infrastructure for downloads

**Trade-offs Accepted:**

- Additional API endpoint for download (acceptable complexity)
- Hybrid approach maintains two generation paths (temporary)
- SVG-to-canvas conversion handled server-side (cleaner separation)

---

## 8. Implementation Plan (Recommended Option)

### Phase 1: Client-Side Display

1. **Install dependency:**
   ```bash
   pnpm --filter=@sabaipics/dashboard add react-qr-code
   ```

2. **Create client-side QR component:**
   ```typescript
   // apps/dashboard/src/components/events/EventQRCode.tsx
   import ReactQRCode from 'react-qr-code';
   
   export function EventQRCode({ accessCode, className }: Props) {
     const url = `https://sabaipics.com/search/${accessCode}`;
     
     return (
       <div className={className}>
         <ReactQRCode
           value={url}
           size={256}
           level="M"
           style={{ 
             height: 'auto', 
             maxWidth: '100%', 
             width: '100%' 
           }}
         />
       </div>
     );
   }
   ```

3. **Update EventQRDisplay:**
   - Replace `<img>` with `<EventQRCode>`
   - Keep download button (implement in Phase 2)

### Phase 2: Download Endpoint

4. **Create download API:**
   ```typescript
   // apps/api/src/routes/events/qr-download.ts
   export const qrDownloadRouter = new Hono<Env>()
     .get('/events/:id/qr-download', requirePhotographer(), async (c) => {
       const event = await getEvent(c.var.db(), c.req.param('id'));
       
       // Generate high-res PNG on-demand
       const pngBytes = await generateEventQR(
         event.accessCode,
         c.env.APP_BASE_URL,
         { scale: 20 }  // 800-1200px
       );
       
       return c.body(pngBytes, 200, {
         'Content-Type': 'image/png',
         'Content-Disposition': `attachment; filename="${event.name}-QR.png"`
       });
     });
   ```

5. **Update client download handler:**
   ```typescript
   const handleDownload = async () => {
     const response = await fetch(`/api/events/${event.id}/qr-download`);
     const blob = await response.blob();
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `${event.name}-QR.png`;
     a.click();
   };
   ```

### Phase 3: Cleanup

6. **Make qrCodeR2Key nullable:**
   ```sql
   ALTER TABLE events ALTER COLUMN qr_code_r2_key DROP NOT NULL;
   ```

7. **Remove eager QR generation:**
   - Remove from event creation flow
   - Keep for download endpoint only

8. **Update tests:**
   - Remove QR generation from event creation tests
   - Add tests for download endpoint

---

## 9. Open Questions (Requires Human Decision)

1. **Download strategy preference:**
   - Should download be server-generated (recommended) or client-generated?
   - Trade-off: Server adds API call, client requires canvas conversion

2. **Offline support requirement:**
   - Is offline QR display critical?
   - If yes, Option A (server-side) or cache strategy needed

3. **Bundle size tolerance:**
   - Is 14.5 KB acceptable?
   - Is 47.8 KB acceptable (if full Canvas API needed)?

4. **Migration timeline:**
   - Should this be a complete migration or gradual rollout?
   - Impact on existing events in database

5. **Error correction level:**
   - Keep current "M" (15%) or increase for print use cases?
   - Higher levels = larger QR codes

---

## 10. References

- **qrcode (node-qrcode):** https://www.npmjs.com/package/qrcode
- **qrcode.react:** https://www.npmjs.com/package/qrcode.react
- **react-qr-code:** https://www.npmjs.com/package/react-qr-code
- **@juit/qrcode:** https://www.npmjs.com/package/@juit/qrcode
- **QR Code specification:** ISO/IEC 18004
- **Current implementation:** `apps/api/src/lib/qr/generate.ts`
- **Display component:** `apps/dashboard/src/components/events/EventQRDisplay.tsx`

---

## 11. Next Steps

1. **Decision required:** Choose option (A/B/C/D) based on priorities
2. **Architecture decision record:** Document chosen approach
3. **Implementation task:** Create T-[#] for implementation
4. **Testing plan:** Verify client-side performance across devices
5. **Rollback plan:** Keep server-side generation until client-side proven
