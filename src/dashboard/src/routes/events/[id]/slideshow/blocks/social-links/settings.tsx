import { Label } from '@/ui/components/ui/label';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import { X, Plus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import type { SlideshowBlock, SocialLinksProps, SocialLinksVariant } from '../../types';

export function SocialLinksSettings({
  block,
  onChange,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
}) {
  const props = block.props as SocialLinksProps;

  const update = (patch: Partial<SocialLinksProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  const addLink = () => {
    update({
      links: [...props.links, { platform: 'instagram', url: '' }],
    });
  };

  const removeLink = (index: number) => {
    update({
      links: props.links.filter((_, i) => i !== index),
    });
  };

  const updateLink = (
    index: number,
    field: 'platform' | 'url',
    value: string,
  ) => {
    const newLinks = [...props.links];
    newLinks[index] = { ...newLinks[index], [field]: value };
    update({ links: newLinks });
  };

  return (
    <div className="space-y-4">
      {/* Variant selector */}
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Style</Label>
        <Select value={props.variant} onValueChange={(v) => update({ variant: v as SocialLinksVariant })}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="horizontal-icons">Horizontal Icons</SelectItem>
            <SelectItem value="vertical-list">Vertical List</SelectItem>
            <SelectItem value="icon-label">Icon + Label</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Links list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Links</Label>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addLink}>
            <Plus className="size-3" />
            Add
          </Button>
        </div>

        {props.links.length === 0 ? (
          <p className="text-xs text-muted-foreground">No links yet</p>
        ) : (
          <div className="space-y-2">
            {props.links.map((link, index) => (
              <div key={index} className="flex items-center gap-2 rounded border bg-muted/50 p-2">
                <div className="flex-1 space-y-1">
                  <Select
                    value={link.platform}
                    onValueChange={(v) => updateLink(index, 'platform', v)}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="x">X (Twitter)</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-7 text-xs"
                    placeholder="URL"
                    value={link.url}
                    onChange={(e) => updateLink(index, 'url', e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLink(index)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
