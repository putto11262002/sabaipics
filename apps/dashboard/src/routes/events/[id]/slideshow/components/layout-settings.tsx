import { Label } from '@sabaipics/uiv3/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import type { SlideshowLayout, SpacingSize, MaxWidthSize } from '../types';

interface LayoutSettingsProps {
  layout: SlideshowLayout;
  onChange: (layout: SlideshowLayout) => void;
}

const SPACING_OPTIONS: { value: SpacingSize; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'xs', label: 'XS (4px)' },
  { value: 'sm', label: 'SM (8px)' },
  { value: 'md', label: 'MD (16px)' },
  { value: 'lg', label: 'LG (24px)' },
  { value: 'xl', label: 'XL (32px)' },
];

const ALIGN_OPTIONS: { value: 'start' | 'center' | 'end'; label: string }[] = [
  { value: 'start', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'Right' },
];

const MAX_WIDTH_OPTIONS: { value: MaxWidthSize; label: string }[] = [
  { value: 'none', label: 'Full Width' },
  { value: 'sm', label: 'Small (640px)' },
  { value: 'md', label: 'Medium (768px)' },
  { value: 'lg', label: 'Large (1024px)' },
  { value: 'xl', label: 'XL (1280px)' },
  { value: '2xl', label: '2XL (1536px)' },
];

export function LayoutSettings({ layout, onChange }: LayoutSettingsProps) {
  const update = (patch: Partial<SlideshowLayout>) => {
    onChange({ ...layout, ...patch });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Label className="w-20 text-xs">Gap</Label>
        <Select value={layout.gap} onValueChange={(v) => update({ gap: v as SpacingSize })}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPACING_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Label className="w-20 text-xs">Padding</Label>
        <Select value={layout.padding} onValueChange={(v) => update({ padding: v as SpacingSize })}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPACING_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Label className="w-20 text-xs">Align</Label>
        <Select
          value={layout.align}
          onValueChange={(v) => update({ align: v as 'start' | 'center' | 'end' })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALIGN_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Label className="w-20 text-xs">Max Width</Label>
        <Select
          value={layout.maxWidth}
          onValueChange={(v) => update({ maxWidth: v as MaxWidthSize })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MAX_WIDTH_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
