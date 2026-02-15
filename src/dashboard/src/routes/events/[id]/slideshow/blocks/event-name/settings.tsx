import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import type { SlideshowBlock, EventNameProps } from '../../types';

export function EventNameSettings({
  block,
  onChange,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
}) {
  const props = block.props as EventNameProps;

  const update = (patch: Partial<EventNameProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Font Size</Label>
        <Select
          value={props.fontSize}
          onValueChange={(v) => update({ fontSize: v as EventNameProps['fontSize'] })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">Small</SelectItem>
            <SelectItem value="md">Medium</SelectItem>
            <SelectItem value="lg">Large</SelectItem>
            <SelectItem value="xl">Extra Large</SelectItem>
            <SelectItem value="2xl">2XL</SelectItem>
            <SelectItem value="3xl">3XL</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Font Weight</Label>
        <Select
          value={props.fontWeight}
          onValueChange={(v) => update({ fontWeight: v as EventNameProps['fontWeight'] })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="semibold">Semibold</SelectItem>
            <SelectItem value="bold">Bold</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
