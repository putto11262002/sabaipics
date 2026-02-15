import { Label } from '@/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import type { SlideshowBlock, StatCardProps } from '../../types';

export function StatCardSettings({
  block,
  onChange,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
}) {
  const props = block.props as StatCardProps;

  const update = (patch: Partial<StatCardProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Metric</Label>
        <Select
          value={props.metric}
          onValueChange={(v) => update({ metric: v as StatCardProps['metric'] })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="photos">Photos</SelectItem>
            <SelectItem value="downloads">Downloads</SelectItem>
            <SelectItem value="searches">Searches</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
