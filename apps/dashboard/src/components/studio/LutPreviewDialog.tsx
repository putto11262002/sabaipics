import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sabaipics/uiv3/components/dialog';
import { Button } from '@sabaipics/uiv3/components/button';
import { Slider } from '@sabaipics/uiv3/components/slider';
import { Switch } from '@sabaipics/uiv3/components/switch';
import { Label } from '@sabaipics/uiv3/components/label';
import { Alert } from '@sabaipics/uiv3/components/alert';
import { Loader2, Upload } from 'lucide-react';
import { usePreviewStudioLut } from '../../hooks/studio/usePreviewStudioLut';

export function LutPreviewDialog({
  open,
  onOpenChange,
  lutId,
  title,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lutId: string | null;
  title?: string;
  initial?: {
    intensity?: number;
    includeLuminance?: boolean;
  };
}) {
  const preview = usePreviewStudioLut();

  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [gradedUrl, setGradedUrl] = useState<string | null>(null);
  const [intensity, setIntensity] = useState<number>(initial?.intensity ?? 75);
  const [includeLuminance, setIncludeLuminance] = useState<boolean>(
    initial?.includeLuminance ?? false,
  );

  const canPreview = Boolean(lutId) && Boolean(file);

  useEffect(() => {
    if (!open) return;
    // Reset state when opened
    setFile(null);
    setOriginalUrl(null);
    setGradedUrl(null);
    setIntensity(initial?.intensity ?? 75);
    setIncludeLuminance(initial?.includeLuminance ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lutId]);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (gradedUrl) URL.revokeObjectURL(gradedUrl);
    };
  }, [originalUrl, gradedUrl]);

  const handleFile = (f: File) => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (gradedUrl) URL.revokeObjectURL(gradedUrl);
    setFile(f);
    setOriginalUrl(URL.createObjectURL(f));
    setGradedUrl(null);
  };

  const handleRunPreview = async () => {
    if (!lutId || !file) return;
    if (gradedUrl) URL.revokeObjectURL(gradedUrl);
    const blob = await preview.mutateAsync({ id: lutId, file, intensity, includeLuminance });
    setGradedUrl(URL.createObjectURL(blob));
  };

  const previewTitle = useMemo(() => title ?? 'Preview LUT', [title]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>{previewTitle}</DialogTitle>
        </DialogHeader>

        {!lutId && <Alert variant="destructive">Select a LUT first.</Alert>}

        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Sample image</Label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
                <span className="truncate">{file ? file.name : 'Upload an image to preview'}</span>
                <Upload className="size-4 text-muted-foreground" />
                <input
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <div className="space-y-2">
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
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="space-y-0.5">
                <Label className="text-sm">Include luminance</Label>
                <p className="text-xs text-muted-foreground">Allow brightness changes</p>
              </div>
              <Switch checked={includeLuminance} onCheckedChange={setIncludeLuminance} />
            </div>

            <Button
              onClick={handleRunPreview}
              disabled={!canPreview || preview.isPending}
              className="w-full"
            >
              {preview.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Rendering…
                </>
              ) : (
                'Render Preview'
              )}
            </Button>

            {preview.isError && (
              <Alert variant="destructive">
                {preview.error instanceof Error ? preview.error.message : 'Preview failed'}
              </Alert>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Before</Label>
              <div className="relative aspect-[4/3] overflow-hidden rounded-md border bg-muted">
                {originalUrl ? (
                  <img src={originalUrl} alt="Original" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    Upload a sample image
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">After</Label>
              <div className="relative aspect-[4/3] overflow-hidden rounded-md border bg-muted">
                {gradedUrl ? (
                  <img src={gradedUrl} alt="Preview" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    Render preview to see result
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
