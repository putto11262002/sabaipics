import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { PageHeader } from '../../../components/shell/page-header';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/shared/components/ui/field';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/shared/components/ui/sheet';
import { Alert, AlertTitle, AlertDescription } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import { Spinner } from '@/shared/components/ui/spinner';
import { AlertCircle, RefreshCw, SlidersHorizontal, Upload } from 'lucide-react';
import { cn } from '@/shared/utils/ui';

import { useDebounce } from '../../../hooks/useDebounce';
import { useAuth } from '@/auth/react';
import { blendToCanvas, loadImage } from './lib/blend-images';

function parseIntensity(value: string | null): number {
  if (value == null) return 100;
  if (value.trim() === '') return 100;
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function parseIncludeLuminance(value: string | null): boolean {
  if (!value) return false;
  return value === '1' || value === 'true' || value === 'yes';
}

export default function StudioLutPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { getToken } = useAuth();

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [gradedBaseUrl, setGradedBaseUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalImgRef = useRef<HTMLImageElement | null>(null);
  const gradedImgRef = useRef<HTMLImageElement | null>(null);

  const [intensity, setIntensity] = useState<number>(() =>
    parseIntensity(searchParams.get('intensity')),
  );
  const [includeLuminance, setIncludeLuminance] = useState<boolean>(() =>
    parseIncludeLuminance(searchParams.get('includeLuminance')),
  );

  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const debouncedIncludeLuminance = useDebounce(includeLuminance, 300);

  useEffect(() => {
    if (gradedBaseUrl) URL.revokeObjectURL(gradedBaseUrl);
    setGradedBaseUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleFile = (f: File) => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (gradedBaseUrl) URL.revokeObjectURL(gradedBaseUrl);
    setFile(f);
    setOriginalUrl(URL.createObjectURL(f));
    setGradedBaseUrl(null);
  };

  const abortRef = useRef<AbortController | null>(null);
  const renderSeqRef = useRef(0);
  useEffect(() => {
    if (!id) return;
    if (!file) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++renderSeqRef.current;
    setRenderError(null);

    const form = new FormData();
    form.set('file', file);
    form.set('intensity', '100');
    form.set('includeLuminance', debouncedIncludeLuminance ? 'true' : 'false');

    const startTimer = setTimeout(() => {
      if (controller.signal.aborted) return;
      if (seq !== renderSeqRef.current) return;

      const tokenTimeoutMs = 10_000;
      setIsRendering(true);

      void (async () => {
        const token = await Promise.race([
          getTokenRef.current(),
          new Promise<string | null>((_, reject) =>
            setTimeout(() => reject(new Error('Auth token timeout')), tokenTimeoutMs),
          ),
        ]);

        const res = await fetch(`${import.meta.env.VITE_API_URL}/studio/luts/${id}/preview`, {
          method: 'POST',
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
          signal: controller.signal,
        });

        if (!res.ok) {
          let message = `Preview failed (${res.status})`;
          try {
            const contentType = res.headers.get('content-type') ?? '';
            if (contentType.includes('application/json')) {
              const json = (await res.json()) as any;
              const apiMsg = json?.error?.message ?? json?.message;
              if (typeof apiMsg === 'string' && apiMsg.trim().length > 0) {
                message = apiMsg;
              }
            } else {
              const text = await res.text();
              if (text.trim().length > 0) {
                message = text;
              }
            }
          } catch {
            // ignore
          }
          throw new Error(message);
        }

        const blob = await res.blob();
        if (controller.signal.aborted) return;
        if (seq !== renderSeqRef.current) return;

        setGradedBaseUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      })()
        .catch((e) => {
          if (controller.signal.aborted) return;
          if (seq !== renderSeqRef.current) return;
          setRenderError(e instanceof Error ? e.message : 'Preview failed');
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          if (seq !== renderSeqRef.current) return;
          setIsRendering(false);
        });
    }, 50);

    return () => {
      clearTimeout(startTimer);
      controller.abort();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };
  }, [id, file, debouncedIncludeLuminance, retryCount]);

  useEffect(() => {
    if (!originalUrl) {
      originalImgRef.current = null;
      return;
    }
    let cancelled = false;
    loadImage(originalUrl).then((img) => {
      if (!cancelled) originalImgRef.current = img;
    });
    return () => {
      cancelled = true;
    };
  }, [originalUrl]);

  useEffect(() => {
    if (!gradedBaseUrl) {
      gradedImgRef.current = null;
      return;
    }
    let cancelled = false;
    loadImage(gradedBaseUrl).then((img) => {
      if (!cancelled) {
        gradedImgRef.current = img;
        const canvas = canvasRef.current;
        if (canvas && originalImgRef.current) {
          blendToCanvas({ canvas, original: originalImgRef.current, graded: img, intensity });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [gradedBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!originalImgRef.current || !gradedImgRef.current) return;

    blendToCanvas({
      canvas,
      original: originalImgRef.current,
      graded: gradedImgRef.current,
      intensity,
    });
  }, [intensity]);

  const canRender = Boolean(id) && Boolean(file);

  const controlsContent = (
    <FieldGroup>
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel>Intensity</FieldLabel>
          <span className="text-xs tabular-nums text-muted-foreground">{intensity}%</span>
        </div>
        <FieldDescription>Strength of the color grade</FieldDescription>
        <Slider
          value={[intensity]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => setIntensity(v[0] ?? 100)}
          disabled={!canRender}
        />
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel>Include luminance</FieldLabel>
          <Switch
            checked={includeLuminance}
            onCheckedChange={setIncludeLuminance}
            disabled={!canRender}
          />
        </div>
        <FieldDescription>Allow brightness changes</FieldDescription>
      </Field>
    </FieldGroup>
  );

  return (
    <div className="flex h-dvh flex-col">
      <PageHeader
        className="border-b"
        backHref="/studio/luts"
        breadcrumbs={[{ label: 'LUT Preview' }]}
      >
        <Button variant="outline" size="sm" className="md:hidden" onClick={() => setSheetOpen(true)}>
          <SlidersHorizontal className="mr-1 size-4" />
          Controls
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        {/* Preview area */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          {!id && <Alert variant="destructive">Missing LUT id.</Alert>}
          {renderError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Preview failed</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>{renderError}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setRenderError(null);
                    setRetryCount((c) => c + 1);
                  }}
                >
                  <RefreshCw className="mr-1 size-3" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            className={cn(
              'relative min-h-0 flex-1 w-full overflow-hidden rounded-lg border-2 border-dashed bg-muted text-left transition-colors',
              isDragging
                ? 'border-primary bg-primary/5'
                : gradedBaseUrl
                  ? 'border-muted-foreground/25 hover:border-muted-foreground/40'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50',
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            {gradedBaseUrl ? (
              <canvas ref={canvasRef} className="h-full w-full object-contain" />
            ) : file ? null : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <Upload className="size-8" />
                <p className="text-sm font-medium">Drop image here or click to browse</p>
                <p className="text-xs">JPEG, PNG, or WebP</p>
              </div>
            )}
            {file && isRendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                <Spinner className="size-6 text-muted-foreground" />
              </div>
            )}
          </button>

          {file && <div className="shrink-0 truncate text-xs text-muted-foreground">{file.name}</div>}
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-80 shrink-0 flex-col">
          <div className="flex flex-1 flex-col overflow-auto p-4">
            {controlsContent}
          </div>
        </aside>
      </div>

      {/* Mobile sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex flex-col sm:max-w-md md:hidden">
          <SheetHeader>
            <SheetTitle>Adjustments</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-auto px-4 pb-4">
            {controlsContent}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
