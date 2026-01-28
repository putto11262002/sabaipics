import { Label } from '@sabaipics/uiv3/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
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
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Size</Label>
        <Select value={String(props.size)} onValueChange={(v) => update({ size: Number(v) })}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="32">32px</SelectItem>
            <SelectItem value="48">48px</SelectItem>
            <SelectItem value="64">64px</SelectItem>
            <SelectItem value="96">96px</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Shape</Label>
        <Select
          value={props.shape}
          onValueChange={(v) => update({ shape: v as LogoProps['shape'] })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="circle">Circle</SelectItem>
            <SelectItem value="square">Square</SelectItem>
            <SelectItem value="rounded">Rounded</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
