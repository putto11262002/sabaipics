import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import type { SlideshowBlock, TextBlockProps, TextBlockVariant } from '../../types';

export function TextBlockSettings({
  block,
  onChange,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
}) {
  const props = block.props as TextBlockProps;

  const update = (patch: Partial<TextBlockProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  return (
    <div className="space-y-4">
      {/* Variant selector */}
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Style</Label>
        <Select
          value={props.variant}
          onValueChange={(v) => update({ variant: v as TextBlockVariant })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="heading">Heading</SelectItem>
            <SelectItem value="paragraph">Paragraph</SelectItem>
            <SelectItem value="caption">Caption</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content textarea */}
      <div className="space-y-2">
        <Label className="text-xs">Content</Label>
        <Textarea
          className="text-xs min-h-[100px]"
          placeholder="Enter your text..."
          value={props.content}
          onChange={(e) => update({ content: e.target.value })}
        />
      </div>
    </div>
  );
}
