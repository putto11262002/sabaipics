import { Label } from '@/ui/components/ui/label';
import { Slider } from '@/ui/components/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import type { SlideshowBlock, GalleryProps, GalleryDensity } from '../../types';

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
            <SelectItem value="sparse">Sparse (2-4 cols)</SelectItem>
            <SelectItem value="normal">Normal (3-6 cols)</SelectItem>
            <SelectItem value="dense">Dense (5-8+ cols)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Rows</Label>
        <Select
          value={String(props.rows ?? 3)}
          onValueChange={(v) => update({ rows: parseInt(v, 10) })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 row</SelectItem>
            <SelectItem value="2">2 rows</SelectItem>
            <SelectItem value="3">3 rows</SelectItem>
            <SelectItem value="4">4 rows</SelectItem>
            <SelectItem value="5">5 rows</SelectItem>
            <SelectItem value="6">6 rows</SelectItem>
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
