import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { SidebarPageHeader } from '../../../components/shell/sidebar-page-header';
import { Label } from '@/ui/components/ui/label';
import { Slider } from '@/ui/components/slider';
import { Switch } from '@/ui/components/ui/switch';
import { Alert } from '@/ui/components/ui/alert';
import { Spinner } from '@/ui/components/ui/spinner';
import { Upload } from 'lucide-react';

import { useDebounce } from '../../../hooks/useDebounce';
import { useApiClient } from '../../../lib/api';

function parseIntensity(value: string | null): number {
  if (value == null) return 75;
  if (value.trim() === '') return 75;
  const n = Number(value);
  if (!Number.isFinite(n)) return 75;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function parseIncludeLuminance(value: string | null): boolean {
  if (!value) return false;
  return value === '1' || value === 'true' || value === 'yes';
}

export default function StudioLutPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { getToken } = useApiClient();

  // `getToken` identity is not guaranteed stable; keep a ref to avoid re-triggering
  // preview renders on every auth state re-render.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [gradedUrl, setGradedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [intensity, setIntensity] = useState<number>(() =>
    parseIntensity(searchParams.get('intensity')),
  );
  const [includeLuminance, setIncludeLuminance] = useState<boolean>(() =>
    parseIncludeLuminance(searchParams.get('includeLuminance')),
  );

  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const debouncedIntensity = useDebounce(intensity, 300);
  const debouncedIncludeLuminance = useDebounce(includeLuminance, 300);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (gradedUrl) URL.revokeObjectURL(gradedUrl);
    };
  }, [originalUrl, gradedUrl]);

  // Clear rendered image when switching LUT.
  useEffect(() => {
    if (gradedUrl) URL.revokeObjectURL(gradedUrl);
    setGradedUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleFile = (f: File) => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (gradedUrl) URL.revokeObjectURL(gradedUrl);
    setFile(f);
    setOriginalUrl(URL.createObjectURL(f));
    setGradedUrl(null);
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
    form.set('intensity', String(debouncedIntensity));
    form.set('includeLuminance', debouncedIncludeLuminance ? 'true' : 'false');

    // Small delay to avoid duplicate requests in React StrictMode (dev)
    // and coalesce ultra-fast changes.
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
              // Best-effort parse our API error shape
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

        setGradedUrl((prev) => {
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
  }, [id, file, debouncedIntensity, debouncedIncludeLuminance]);

  const canRender = Boolean(id) && Boolean(file);

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Studio' },
          { label: 'LUTs', href: '/studio/luts' },
          { label: 'Preview' },
        ]}
      />

      <div className="flex flex-1 flex-col gap-4 p-4">
        {!id && <Alert variant="destructive">Missing LUT id.</Alert>}
        {renderError && <Alert variant="destructive">{renderError}</Alert>}

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

        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Intensity</Label>
              <span className="text-xs text-muted-foreground">{intensity}%</span>
            </div>
            <Slider
              value={[intensity]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => setIntensity(v[0] ?? 75)}
              disabled={!canRender}
            />
          </div>

          <div className="flex items-center gap-3">
            <Label className="text-xs">Include luminance</Label>
            <Switch
              checked={includeLuminance}
              onCheckedChange={setIncludeLuminance}
              disabled={!canRender}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs">Before</Label>
            <button
              type="button"
              className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted"
              onClick={() => fileInputRef.current?.click()}
            >
              {originalUrl ? (
                <img src={originalUrl} alt="Original" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Upload className="size-5" />
                  <div className="text-xs">Click to choose a sample image</div>
                </div>
              )}
            </button>
            {file && <div className="truncate text-xs text-muted-foreground">{file.name}</div>}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">After</Label>
            <div className="relative aspect-[4/3] overflow-hidden rounded-md border bg-muted">
              {gradedUrl ? (
                <img src={gradedUrl} alt="Preview" className="h-full w-full object-contain" />
              ) : file ? null : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  Choose a sample image to preview
                </div>
              )}
              {file && isRendering && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Spinner className="size-6 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
