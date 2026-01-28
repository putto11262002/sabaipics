import { Label } from '@sabaipics/uiv3/components/label';
import { Slider } from '@sabaipics/uiv3/components/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import type { SlideshowBlock, GalleryProps } from '../../types';

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
        <Label className="w-20 text-xs">Columns</Label>
        <Select value={String(props.columns)} onValueChange={(v) => update({ columns: Number(v) })}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2 Columns</SelectItem>
            <SelectItem value="3">3 Columns</SelectItem>
            <SelectItem value="4">4 Columns</SelectItem>
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
