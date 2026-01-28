import { Label } from '@sabaipics/uiv3/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import type { SlideshowBlock, SubtitleProps } from '../../types';

export function SubtitleSettings({
  block,
  onChange,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
}) {
  const props = block.props as SubtitleProps;

  const update = (patch: Partial<SubtitleProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Font Size</Label>
        <Select
          value={props.fontSize}
          onValueChange={(v) => update({ fontSize: v as SubtitleProps['fontSize'] })}
        >
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
    </div>
  );
}
