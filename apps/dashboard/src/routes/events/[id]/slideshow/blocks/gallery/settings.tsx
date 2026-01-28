import { Label } from '@sabaipics/uiv3/components/label';
import { Slider } from '@sabaipics/uiv3/components/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import type { SlideshowBlock, GalleryProps, GalleryDensity, GalleryAlignY } from '../../types';
import { Input } from '@sabaipics/uiv3/components/input';

export function GallerySettings({
  block,
  onChange,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
}) {
  const props = block.props as GalleryProps;

  const update = (patch: Partial<GalleryProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Density</Label>
        <Select
          value={props.density ?? 'normal'}
          onValueChange={(v) => update({ density: v as GalleryDensity })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sparse">Sparse (3-4 cols)</SelectItem>
            <SelectItem value="normal">Normal (4-6 cols)</SelectItem>
            <SelectItem value="dense">Dense (6-8 cols)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Gap</Label>
          <span className="text-xs text-muted-foreground">{props.gap}px</span>
        </div>
        <Slider
          value={[props.gap]}
          onValueChange={([v]) => update({ gap: v })}
          min={0}
          max={24}
          step={2}
        />
      </div>

      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Max Height</Label>
        <Select
          value={props.maxHeight === 'full' ? 'full' : 'custom'}
          onValueChange={(v) => update({ maxHeight: v === 'full' ? 'full' : props.maxHeight ?? 600 })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full">Full (100vh)</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {props.maxHeight !== 'full' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Height (px)</Label>
            <Input
              type="number"
              className="h-8 w-20 text-xs"
              value={typeof props.maxHeight === 'number' ? props.maxHeight : 600}
              onChange={(e) => update({ maxHeight: parseInt(e.target.value, 10) || 600 })}
              min={100}
              max={2000}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Align Y</Label>
        <Select
          value={props.alignY ?? 'center'}
          onValueChange={(v) => update({ alignY: v as GalleryAlignY })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="start">Top</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="end">Bottom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Autoplay Speed</Label>
          <span className="text-xs text-muted-foreground">
            {props.autoplaySpeed === 0 ? 'Off' : `${props.autoplaySpeed}s`}
          </span>
        </div>
        <Slider
          value={[props.autoplaySpeed]}
          onValueChange={([v]) => update({ autoplaySpeed: v })}
          min={0}
          max={15}
          step={1}
        />
      </div>
    </div>
  );
}
