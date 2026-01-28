import { Label } from '@sabaipics/uiv3/components/label';
import { Slider } from '@sabaipics/uiv3/components/slider';
import type { SlideshowBlock, LogoProps } from '../../types';

export function LogoSettings({
  block,
  onChange,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
}) {
  const props = block.props as LogoProps;

  const update = (patch: Partial<LogoProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Logo Width</Label>
          <span className="text-xs text-muted-foreground">{props.width}%</span>
        </div>
        <Slider
          value={[props.width]}
          onValueChange={([v]) => update({ width: v })}
          min={10}
          max={50}
          step={1}
        />
      </div>
    </div>
  );
}
