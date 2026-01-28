import { Label } from '@sabaipics/uiv3/components/label';
import { Input } from '@sabaipics/uiv3/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import type { SlideshowBlock, SocialIconProps } from '../../types';

export function SocialIconSettings({
  block,
  onChange,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
}) {
  const props = block.props as SocialIconProps;

  const update = (patch: Partial<SocialIconProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Platform</Label>
        <Select
          value={props.platform}
          onValueChange={(v) => update({ platform: v as SocialIconProps['platform'] })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
            <SelectItem value="x">X</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Profile URL</Label>
        <Input
          value={props.url ?? ''}
          onChange={(e) => update({ url: e.target.value })}
          placeholder="https://..."
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}
