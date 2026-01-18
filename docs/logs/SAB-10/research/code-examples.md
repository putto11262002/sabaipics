# Client-Side QR Code Implementation Examples

Code snippets for implementing client-side QR generation in the SabaiPics dashboard.

---

## 1. react-qr-code (Recommended)

### Basic Display Component

```typescript
// apps/dashboard/src/components/events/EventQRCode.tsx
import ReactQRCode from 'react-qr-code';
import { cn } from '@sabaipics/ui/lib/utils';

interface EventQRCodeProps {
  accessCode: string;
  baseUrl?: string;
  className?: string;
  size?: number;
}

export function EventQRCode({ 
  accessCode, 
  baseUrl = 'https://sabaipics.com',
  className,
  size = 256 
}: EventQRCodeProps) {
  const url = `${baseUrl}/search/${accessCode}`;
  
  return (
    <div className={cn('flex justify-center', className)}>
      <ReactQRCode
        value={url}
        size={size}
        level="M"
        bgColor="#FFFFFF"
        fgColor="#000000"
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

### Responsive Sizing with Breakpoints

```typescript
import { useState, useEffect } from 'react';
import ReactQRCode from 'react-qr-code';

function ResponsiveEventQRCode({ accessCode }: { accessCode: string }) {
  const [containerSize, setContainerSize] = useState(400);
  
  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      if (width < 640) setContainerSize(300);      // Mobile
      else if (width < 1024) setContainerSize(400); // Tablet
      else setContainerSize(500);                   // Desktop
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);
  
  return (
    <div className="w-full max-w-md">
      <ReactQRCode
        value={`https://sabaipics.com/search/${accessCode}`}
        size={containerSize}
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

### Download Handler (Server API)

```typescript
// apps/dashboard/src/components/events/EventQRDisplay.tsx
import { useState } from 'react';
import { Button } from '@sabaipics/ui/components/button';
import { Download } from 'lucide-react';

function EventQRDisplay({ event }: { event: Event }) {
  const [isDownloading, setIsDownloading] = useState(false);
  
  const handleDownload = async () => {
    setIsDownloading(true);
    
    try {
      // Call server endpoint for high-res PNG
      const response = await fetch(`/api/events/${event.id}/qr-download`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error('Failed to download QR code');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event.name.replace(/[^a-z0-9]/gi, '-')}-QR.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      // Show error toast
    } finally {
      setIsDownloading(false);
    }
  };
  
  return (
    <div>
      <EventQRCode accessCode={event.accessCode} />
      <Button onClick={handleDownload} disabled={isDownloading}>
        {isDownloading ? 'Downloading...' : (
          <>
            <Download className="mr-2 h-4 w-4" />
            Download QR Code
          </>
        )}
      </Button>
    </div>
  );
}
```

### Download Handler (Client-Side Canvas)

```typescript
import { useRef } from 'react';
import ReactQRCode from 'react-qr-code';

function ClientSideDownload({ event }: { event: Event }) {
  const svgRef = useRef<SVGSVGElement>(null);
  
  const handleDownload = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    
    // Create canvas for high-res output
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set high resolution for print (1200x1200)
    const outputSize = 1200;
    canvas.width = outputSize;
    canvas.height = outputSize;
    
    // Convert SVG to image
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob(
      [svgData], 
      { type: 'image/svg+xml;charset=utf-8' }
    );
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.onload = () => {
      // Draw to canvas with white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, outputSize, outputSize);
      ctx.drawImage(img, 0, 0, outputSize, outputSize);
      
      // Convert to PNG and download
      canvas.toBlob((blob) => {
        if (blob) {
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `${event.name.replace(/[^a-z0-9]/gi, '-')}-QR.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(downloadUrl);
        }
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    
    img.src = url;
  };
  
  return (
    <div>
      <ReactQRCode
        ref={svgRef}
        value={`https://sabaipics.com/search/${event.accessCode}`}
        size={256}
        level="M"
      />
      <Button onClick={handleDownload}>Download</Button>
    </div>
  );
}
```

---

## 2. qrcode.react Implementation

### Canvas-Based Display

```typescript
import { QRCodeCanvas } from 'qrcode.react';

function EventQRCodeWithCanvas({ accessCode }: { accessCode: string }) {
  return (
    <div className="flex justify-center">
      <QRCodeCanvas
        value={`https://sabaipics.com/search/${accessCode}`}
        size={400}
        level="M"
        bgColor="#FFFFFF"
        fgColor="#000000"
        includeMargin={true}
      />
    </div>
  );
}
```

### Canvas Download Handler

```typescript
import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { QRCode } from 'qrcode';

function CanvasDownload({ event }: { event: Event }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const handleDownload = async () => {
    // Option 1: Use existing canvas (low-res)
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${event.name}-QR.png`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }, 'image/png');
    }
    
    // Option 2: Generate high-res version
    const highResCanvas = document.createElement('canvas');
    await QRCode.toCanvas(
      highResCanvas,
      `https://sabaipics.com/search/${event.accessCode}`,
      {
        width: 1200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }
    );
    
    highResCanvas.toBlob((blob) => {
      if (blob) {
        // Download logic
      }
    }, 'image/png');
  };
  
  return (
    <div>
      <QRCodeCanvas
        ref={canvasRef}
        value={`https://sabaipics.com/search/${event.accessCode}`}
        size={400}
        level="M"
      />
      <Button onClick={handleDownload}>Download</Button>
    </div>
  );
}
```

---

## 3. Server-Side Download Endpoint

### API Route (Hono)

```typescript
// apps/api/src/routes/events/qr-download.ts
import { Hono } from 'hono';
import { requirePhotographer } from '../../middleware';
import { generateEventQR } from '../../lib/qr';
import type { Bindings } from '../../types';

type Env = {
  Bindings: Bindings;
};

export const qrDownloadRouter = new Hono<Env>()
  .get(
    '/events/:id/qr-download',
    requirePhotographer(),
    async (c) => {
      const db = c.var.db();
      const eventId = c.req.param('id');
      const photographer = c.var.photographer;
      
      // Fetch event
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);
      
      if (!event) {
        return c.json({ error: 'Event not found' }, 404);
      }
      
      // Authorization
      if (event.photographerId !== photographer.id) {
        return c.json({ error: 'Forbidden' }, 403);
      }
      
      // Generate high-res QR for print/download
      const qrPng = await generateEventQR(
        event.accessCode,
        c.env.APP_BASE_URL,
        { scale: 20 }  // High resolution: ~800-1200px
      );
      
      // Return as downloadable PNG
      const filename = `${event.name.replace(/[^a-z0-9]/gi, '-')}-QR.png`;
      
      return c.body(qrPng, 200, {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=86400', // Cache for 24h
      });
    }
  );
```

### Modified generateEventQR for Size Parameter

```typescript
// apps/api/src/lib/qr/generate.ts
import { generatePngQrCode } from "@juit/qrcode";

interface GenerateQROptions {
  scale?: number;      // Pixels per module (default: 10)
  ecLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
}

export async function generateEventQR(
  accessCode: string,
  baseUrl: string,
  options: GenerateQROptions = {}
): Promise<Uint8Array> {
  // Validate access code format
  if (!/^[A-Z0-9]{6}$/.test(accessCode)) {
    throw new Error(
      `Invalid access code format: "${accessCode}"`
    );
  }
  
  const { scale = 10, ecLevel = 'M', margin = 4 } = options;
  const searchUrl = `${baseUrl}/search/${accessCode}`;
  
  const pngBytes = await generatePngQrCode(searchUrl, {
    ecLevel,
    margin,
    scale,
  });
  
  return pngBytes;
}
```

---

## 4. Caching Strategy

### React Hook for Cached QR Codes

```typescript
import { useState, useEffect } from 'react';
import { QRCode } from 'qrcode';

interface UseQRCodeOptions {
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  cacheKey?: string;
}

export function useQRCode(
  value: string,
  options: UseQRCodeOptions = {}
) {
  const { size = 400, level = 'M', cacheKey } = options;
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const generate = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Check cache if key provided
        if (cacheKey) {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            setDataUrl(cached);
            setIsLoading(false);
            return;
          }
        }
        
        // Generate QR
        const url = await QRCode.toDataURL(value, {
          width: size,
          errorCorrectionLevel: level,
        });
        
        setDataUrl(url);
        
        // Cache if key provided
        if (cacheKey) {
          localStorage.setItem(cacheKey, url);
          // Clear cache after 1 hour
          setTimeout(() => {
            localStorage.removeItem(cacheKey);
          }, 3600000);
        }
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };
    
    generate();
  }, [value, size, level, cacheKey]);
  
  return { dataUrl, isLoading, error };
}

// Usage
function CachedQRCode({ accessCode }: { accessCode: string }) {
  const url = `https://sabaipics.com/search/${accessCode}`;
  const cacheKey = `qr-${accessCode}`;
  
  const { dataUrl, isLoading, error } = useQRCode(url, {
    size: 400,
    cacheKey,
  });
  
  if (isLoading) return <div>Loading QR code...</div>;
  if (error) return <div>Error loading QR code</div>;
  
  return <img src={dataUrl || ''} alt="QR Code" />;
}
```

---

## 5. Migration Strategy

### Phase 1: Add Client-Side Component

```typescript
// apps/dashboard/src/components/events/EventQRDisplay.tsx
import { useState } from 'react';
import { EventQRCode } from './EventQRCode'; // New client component

export function EventQRDisplay({ event }: EventQRDisplayProps) {
  const [useClientQR, setUseClientQR] = useState(
    localStorage.getItem('use-client-qr') === 'true'
  );
  
  const toggleQRMode = () => {
    const newValue = !useClientQR;
    setUseClientQR(newValue);
    localStorage.setItem('use-client-qr', String(newValue));
  };
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>QR Code & Links</CardTitle>
          <Button onClick={toggleQRMode} variant="ghost" size="sm">
            {useClientQR ? 'Use Server QR' : 'Use Client QR'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {useClientQR ? (
          <EventQRCode accessCode={event.accessCode} />
        ) : (
          <img src={event.qrCodeUrl} alt="QR Code" />
        )}
      </CardContent>
    </Card>
  );
}
```

### Phase 2: Update Event Type

```typescript
// apps/dashboard/src/hooks/events/useEvents.ts
export type Event = {
  id: string;
  name: string;
  accessCode: string;
  qrCodeUrl: string | null;  // Keep for fallback, but make optional
  // ... other fields
};
```

### Phase 3: Remove Server-Side Generation

```typescript
// apps/api/src/routes/events/index.ts
// REMOVE:
// import { generateEventQR } from '../../lib/qr';
// const qrPng = await generateEventQR(accessCode, c.env.APP_BASE_URL);
// await c.env.PHOTOS_BUCKET.put(r2Key, qrPng);

// REPLACE with:
const qrCodeR2Key = null;  // No longer generated on creation
```

---

## 6. Testing Examples

### Unit Test for QR Code Component

```typescript
// EventQRCode.test.tsx
import { render, screen } from '@testing-library/react';
import { EventQRCode } from './EventQRCode';

describe('EventQRCode', () => {
  it('renders QR code with correct value', () => {
    render(<EventQRCode accessCode="ABC123" />);
    
    const qrElement = screen.getByRole('img');
    expect(qrElement).toBeInTheDocument();
    expect(qrElement).toHaveAttribute('value', expect.stringContaining('ABC123'));
  });
  
  it('applies custom className', () => {
    const { container } = render(
      <EventQRCode accessCode="ABC123" className="custom-class" />
    );
    
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
```

### Integration Test for Download

```typescript
// EventQRDisplay.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { EventQRDisplay } from './EventQRDisplay';

describe('EventQRDisplay Download', () => {
  it('downloads QR code when button clicked', async () => {
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['png-data'], { type: 'image/png' }))
      })
    );
    global.fetch = mockFetch;
    
    const event = {
      id: '123',
      name: 'Test Event',
      accessCode: 'ABC123',
      qrCodeUrl: null
    };
    
    render(<EventQRDisplay event={event} />);
    
    const downloadButton = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadButton);
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/events/123/qr-download');
    });
  });
});
```

---

## 7. Performance Monitoring

### Performance Measurement Hook

```typescript
import { useEffect, useRef } from 'react';

export function useQRPerformance() {
  const startTime = useRef<number>();
  
  const startMeasure = () => {
    startTime.current = performance.now();
  };
  
  const endMeasure = (label: string) => {
    if (startTime.current) {
      const duration = performance.now() - startTime.current;
      console.log(`[QR Performance] ${label}: ${duration.toFixed(2)}ms`);
      
      // Send to analytics if needed
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'qr_generation', {
          event_category: 'performance',
          value: Math.round(duration),
          event_label: label
        });
      }
    }
  };
  
  return { startMeasure, endMeasure };
}

// Usage
function EventQRCode({ accessCode }: { accessCode: string }) {
  const { startMeasure, endMeasure } = useQRPerformance();
  
  useEffect(() => {
    startMeasure();
    // ... QR generation
    endMeasure(`client-qr-${accessCode}`);
  }, [accessCode]);
  
  return <ReactQRCode value={`...`} />;
}
```
