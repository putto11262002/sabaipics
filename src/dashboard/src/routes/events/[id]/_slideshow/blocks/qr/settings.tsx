import { Label } from '@/shared/components/ui/label';
import { Input } from '@/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import type { SlideshowBlock, QrProps } from '../../types';

export function QrSettings({
  block,
  onChange,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
}) {
  const props = block.props as QrProps;

  const update = (patch: Partial<QrProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Size</Label>
        <Select value={props.size} onValueChange={(v) => update({ size: v as 'sm' | 'md' | 'lg' })}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">Small</SelectItem>
            <SelectItem value="md">Medium</SelectItem>
            <SelectItem value="lg">Large</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Label</Label>
        <Input
          value={props.label}
          onChange={(e) => update({ label: e.target.value })}
          className="h-8 flex-1 text-xs"
        />
      </div>
    </div>
  );
}
