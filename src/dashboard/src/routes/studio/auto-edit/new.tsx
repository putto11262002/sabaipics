import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { SidebarPageHeader } from '../../../components/shell/sidebar-page-header';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Alert } from '@/shared/components/ui/alert';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/shared/components/ui/field';
import { Upload, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/shared/utils/ui';
import { toast } from 'sonner';
import { useCreateAutoEditPreset } from '../../../hooks/studio/useCreateAutoEditPreset';
import { useAutoEditPresets } from '../../../hooks/studio/useAutoEditPresets';
import { useUpdateAutoEditPreset } from '../../../hooks/studio/useUpdateAutoEditPreset';

type EditorState = {
  name: string;
  contrast: number;
  brightness: number;
  saturation: number;
  sharpness: number;
  autoContrast: boolean;
  intensity: number;
};

const INITIAL_STATE: EditorState = {
  name: 'My preset',
  contrast: 1,
  brightness: 1,
  saturation: 1,
  sharpness: 1,
  autoContrast: false,
  intensity: 100,
};

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function applyAutoContrast(pixels: Uint8ClampedArray, cutoffPercent = 0.5): void {
  const totalPixels = pixels.length / 4;
  const cutoffCount = Math.floor((cutoffPercent / 100) * totalPixels);

  for (let channel = 0; channel < 3; channel++) {
    const hist = new Array<number>(256).fill(0);
    for (let i = channel; i < pixels.length; i += 4) {
      hist[pixels[i] ?? 0]++;
    }

    let low = 0;
    let count = 0;
    while (low < 255 && count < cutoffCount) {
      count += hist[low] ?? 0;
      low++;
    }

    let high = 255;
    count = 0;
    while (high > 0 && count < cutoffCount) {
      count += hist[high] ?? 0;
      high--;
    }

    if (high <= low) continue;
    const scale = 255 / (high - low);
    for (let i = channel; i < pixels.length; i += 4) {
      const v = pixels[i] ?? 0;
      const mapped = Math.round((v - low) * scale);
      pixels[i] = Math.min(255, Math.max(0, mapped));
    }
  }
}

function applySharpen(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): Uint8ClampedArray {
  if (amount <= 0) return pixels;
  const src = new Uint8ClampedArray(pixels);
  const out = new Uint8ClampedArray(pixels.length);
  const a = Math.min(2, amount);
  const kernel = [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        out[idx] = src[idx] ?? 0;
        out[idx + 1] = src[idx + 1] ?? 0;
        out[idx + 2] = src[idx + 2] ?? 0;
        out[idx + 3] = src[idx + 3] ?? 255;
        continue;
      }

      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const k = kernel[(ky + 1) * 3 + (kx + 1)] ?? 0;
            const p = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += (src[p] ?? 0) * k;
          }
        }
        out[idx + c] = Math.max(0, Math.min(255, Math.round(sum)));
      }
      out[idx + 3] = src[idx + 3] ?? 255;
    }
  }

  return out;
}

export default function StudioAutoEditNewPage() {
  const { id: editId } = useParams<{ id: string }>();
  const isEdit = Boolean(editId);
  const navigate = useNavigate();
  const createPreset = useCreateAutoEditPreset();
  const updatePreset = useUpdateAutoEditPreset();
  const presets = useAutoEditPresets();
  const [state, setState] = useState<EditorState>(INITIAL_STATE);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [sampleRevision, setSampleRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const basePixelsRef = useRef<Uint8ClampedArray | null>(null);
  const baseSizeRef = useRef<{ width: number; height: number } | null>(null);

  const controls = useMemo(
    () =>
      [
        ['contrast', 'Contrast'],
        ['brightness', 'Brightness'],
        ['saturation', 'Saturation'],
        ['sharpness', 'Sharpness'],
      ] as const,
    [],
  );

  const editingPreset = useMemo(() => {
    if (!editId) return null;
    return (presets.data ?? []).find((p) => p.id === editId) ?? null;
  }, [editId, presets.data]);

  useEffect(() => {
    if (!isEdit) return;
    if (!editingPreset) return;
    setState((prev) => ({
      ...prev,
      name: editingPreset.name,
      contrast: editingPreset.contrast,
      brightness: editingPreset.brightness,
      saturation: editingPreset.saturation,
      sharpness: editingPreset.sharpness,
      autoContrast: editingPreset.autoContrast,
    }));
  }, [isEdit, editingPreset]);

  const handleSample = async (file: File) => {
    setError(null);
    const nextUrl = URL.createObjectURL(file);

    try {
      const bitmap = await createImageBitmap(file);
      const maxW = 1200;
      const scale = bitmap.width > maxW ? maxW / bitmap.width : 1;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        bitmap.close();
        throw new Error('Failed to process sample image');
      }

      tempCtx.clearRect(0, 0, width, height);
      tempCtx.drawImage(bitmap, 0, 0, width, height);
      const img = tempCtx.getImageData(0, 0, width, height);
      basePixelsRef.current = new Uint8ClampedArray(img.data);
      baseSizeRef.current = { width, height };
      setSampleRevision((v) => v + 1);
      bitmap.close();

      setSampleUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextUrl;
      });
    } catch (e) {
      URL.revokeObjectURL(nextUrl);
      setError(e instanceof Error ? e.message : 'Failed to load sample image');
    }
  };

  useEffect(() => {
    const base = basePixelsRef.current;
    const size = baseSizeRef.current;
    const canvas = originalCanvasRef.current;
    if (!base || !size || !canvas) return;

    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const outData = new Uint8ClampedArray(base.length);
    outData.set(base);
    ctx.putImageData(new ImageData(outData, size.width, size.height), 0, 0);
  }, [sampleRevision]);

  useEffect(() => {
    const base = basePixelsRef.current;
    const size = baseSizeRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!base || !size || !previewCanvas) return;

    const { width, height } = size;
    previewCanvas.width = width;
    previewCanvas.height = height;
    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    const original = new Uint8ClampedArray(base);
    const edited = new Uint8ClampedArray(base);

    if (state.autoContrast) {
      applyAutoContrast(edited, 0.5);
    }

    for (let i = 0; i < edited.length; i += 4) {
      let r = (edited[i] ?? 0) / 255;
      let g = (edited[i + 1] ?? 0) / 255;
      let b = (edited[i + 2] ?? 0) / 255;

      r = clamp01(r * state.brightness);
      g = clamp01(g * state.brightness);
      b = clamp01(b * state.brightness);

      r = clamp01((r - 0.5) * state.contrast + 0.5);
      g = clamp01((g - 0.5) * state.contrast + 0.5);
      b = clamp01((b - 0.5) * state.contrast + 0.5);

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = clamp01(gray + (r - gray) * state.saturation);
      g = clamp01(gray + (g - gray) * state.saturation);
      b = clamp01(gray + (b - gray) * state.saturation);

      edited[i] = Math.round(r * 255);
      edited[i + 1] = Math.round(g * 255);
      edited[i + 2] = Math.round(b * 255);
    }

    const sharpened = applySharpen(edited, width, height, Math.max(0, state.sharpness - 1));
    const blend = state.intensity / 100;
    for (let i = 0; i < sharpened.length; i++) {
      sharpened[i] = Math.round((original[i] ?? 0) * (1 - blend) + (sharpened[i] ?? 0) * blend);
    }

    const outData = new Uint8ClampedArray(sharpened.length);
    outData.set(sharpened);
    const out = new ImageData(outData, width, height);
    ctx.putImageData(out, 0, 0);
  }, [state, sampleRevision]);

  const savePreset = async () => {
    try {
      if (isEdit) {
        if (!editingPreset || editingPreset.isBuiltin) {
          toast.error('Only custom presets can be edited');
          return;
        }
        await updatePreset.mutateAsync({
          id: editingPreset.id,
          name: state.name.trim(),
          contrast: state.contrast,
          brightness: state.brightness,
          saturation: state.saturation,
          sharpness: state.sharpness,
          autoContrast: state.autoContrast,
        });
        toast.success('Preset updated');
      } else {
        await createPreset.mutateAsync({
          name: state.name.trim(),
          contrast: state.contrast,
          brightness: state.brightness,
          saturation: state.saturation,
          sharpness: state.sharpness,
          autoContrast: state.autoContrast,
        });
        toast.success('Preset created');
      }
      navigate('/studio/auto-edit');
    } catch (e) {
      toast.error(isEdit ? 'Failed to update preset' : 'Failed to create preset', {
        description: e instanceof Error ? e.message : 'Something went wrong',
      });
    }
  };

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Studio' },
          { label: 'Auto Edit', href: '/studio/auto-edit' },
          { label: isEdit ? 'Edit Preset' : 'New Preset' },
        ]}
      >
        <Button variant="outline" size="sm" onClick={() => navigate('/studio/auto-edit')}>
          <ArrowLeft className="mr-1 size-4" />
          Back
        </Button>
      </SidebarPageHeader>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {isEdit && !editingPreset && !presets.isLoading ? (
          <Alert variant="destructive">Preset not found.</Alert>
        ) : null}

        {isEdit && editingPreset?.isBuiltin ? (
          <Alert variant="destructive">Built-in presets cannot be edited.</Alert>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleSample(file);
            e.target.value = '';
          }}
        />

        <div className="space-y-4 rounded-lg border p-4">
          <FieldGroup>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel>Preset name</FieldLabel>
                <FieldDescription>Name shown in event settings dropdown</FieldDescription>
              </FieldContent>
              <div className="w-full flex justify-end">
                <Input
                  value={state.name}
                  onChange={(e) => setState((prev) => ({ ...prev, name: e.target.value }))}
                  className="max-w-xs"
                />
              </div>
            </Field>

            {controls.map(([key, label]) => (
              <Field key={key} orientation="responsive">
                <FieldContent>
                  <FieldLabel>{label}</FieldLabel>
                  <FieldDescription>Current: {state[key].toFixed(2)}</FieldDescription>
                </FieldContent>
                <div className="w-full flex items-center justify-end gap-3">
                  <Slider
                    className="w-56"
                    value={[state[key]]}
                    min={0.5}
                    max={2}
                    step={0.01}
                    onValueChange={(v) => setState((prev) => ({ ...prev, [key]: v[0] ?? 1 }))}
                  />
                </div>
              </Field>
            ))}

            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel>Intensity</FieldLabel>
                <FieldDescription>
                  Blend edited image with original. Current: {state.intensity}%
                </FieldDescription>
              </FieldContent>
              <div className="w-full flex items-center justify-end">
                <Slider
                  value={[state.intensity]}
                  min={0}
                  max={100}
                  step={1}
                  className="w-56"
                  onValueChange={(v) => setState((prev) => ({ ...prev, intensity: v[0] ?? 100 }))}
                />
              </div>
            </Field>

            <Field orientation="responsive" align="end">
              <FieldContent>
                <FieldLabel>Auto contrast</FieldLabel>
                <FieldDescription>Auto-level tonal range</FieldDescription>
              </FieldContent>
              <Switch
                checked={state.autoContrast}
                onCheckedChange={(v) => setState((prev) => ({ ...prev, autoContrast: v }))}
              />
            </Field>
          </FieldGroup>

          <div className="flex justify-end">
            <Button
              onClick={savePreset}
              disabled={
                !state.name.trim() ||
                createPreset.isPending ||
                updatePreset.isPending ||
                (isEdit && (!editingPreset || editingPreset.isBuiltin))
              }
            >
              {isEdit ? 'Save changes' : 'Save preset'}
            </Button>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Preview</p>
            <p className="text-xs text-muted-foreground">Click or drop image on Before to upload</p>
          </div>

          {error ? <Alert variant="destructive">{error}</Alert> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel>Before</FieldLabel>
              <button
                type="button"
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
                  if (f) void handleSample(f);
                }}
                className={cn(
                  'h-[320px] w-full overflow-hidden rounded-lg border-2 border-dashed bg-muted text-left transition-colors md:h-[360px]',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : sampleUrl
                      ? 'border-muted-foreground/25 hover:border-muted-foreground/40'
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50',
                )}
              >
                {sampleUrl ? (
                  <canvas ref={originalCanvasRef} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Upload className="size-8" />
                    <p className="text-sm font-medium">Drop image here or click to browse</p>
                    <p className="text-xs">JPEG, PNG, or WebP</p>
                  </div>
                )}
              </button>
            </div>

            <div className="space-y-2">
              <FieldLabel>After</FieldLabel>
              <div className="h-[320px] w-full overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted md:h-[360px]">
                {sampleUrl ? (
                  <canvas ref={previewCanvasRef} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ImageIcon className="size-8" />
                    <p className="text-sm font-medium">Preview will appear here</p>
                    <p className="text-xs">Adjust controls above after uploading</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
