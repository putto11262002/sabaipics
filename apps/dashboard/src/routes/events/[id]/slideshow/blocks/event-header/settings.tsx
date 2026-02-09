import { Label } from '@sabaipics/uiv3/components/label';
import { Switch } from '@sabaipics/uiv3/components/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import type { SlideshowBlock, EventHeaderProps, SpacingSize } from '../../types';

export function EventHeaderSettings({
  block,
  onChange,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
}) {
  const props = block.props as EventHeaderProps;

  const update = (patch: Partial<EventHeaderProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  return (
    <div className="space-y-4">
      {/* Component toggles */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Components</Label>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Show Logo</Label>
          <Switch checked={props.showLogo} onCheckedChange={(v) => update({ showLogo: v })} />
        </div>

        {props.showLogo && (
          <div className="flex items-center gap-2 pl-4">
            <Label className="w-16 text-xs">Size</Label>
            <Select value={props.logoSize} onValueChange={(v) => update({ logoSize: v as 'sm' | 'md' | 'lg' })}>
              <SelectTrigger className="h-7 flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Small</SelectItem>
                <SelectItem value="md">Medium</SelectItem>
                <SelectItem value="lg">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Label className="text-xs">Show Name</Label>
          <Switch checked={props.showName} onCheckedChange={(v) => update({ showName: v })} />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Show Subtitle</Label>
          <Switch checked={props.showSubtitle} onCheckedChange={(v) => update({ showSubtitle: v })} />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Show QR Code</Label>
          <Switch checked={props.showQr} onCheckedChange={(v) => update({ showQr: v })} />
        </div>

        {props.showQr && (
          <div className="flex items-center gap-2 pl-4">
            <Label className="w-16 text-xs">Size</Label>
            <Select value={props.qrSize} onValueChange={(v) => update({ qrSize: v as 'sm' | 'md' | 'lg' })}>
              <SelectTrigger className="h-7 flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Small</SelectItem>
                <SelectItem value="md">Medium</SelectItem>
                <SelectItem value="lg">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Layout controls */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Layout</Label>

        <div className="flex items-center gap-2">
          <Label className="w-16 text-xs">Direction</Label>
          <Select value={props.direction} onValueChange={(v) => update({ direction: v as 'row' | 'column' })}>
            <SelectTrigger className="h-7 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="row">Row</SelectItem>
              <SelectItem value="column">Column</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="w-16 text-xs">Align</Label>
          <Select value={props.align} onValueChange={(v) => update({ align: v as 'start' | 'center' | 'end' })}>
            <SelectTrigger className="h-7 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">Start</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="end">End</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="w-16 text-xs">Justify</Label>
          <Select value={props.justify} onValueChange={(v) => update({ justify: v as 'start' | 'center' | 'end' | 'between' })}>
            <SelectTrigger className="h-7 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">Start</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="end">End</SelectItem>
              <SelectItem value="between">Space Between</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="w-16 text-xs">Gap</Label>
          <Select value={props.gap} onValueChange={(v) => update({ gap: v as SpacingSize })}>
            <SelectTrigger className="h-7 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="xs">Extra Small</SelectItem>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
              <SelectItem value="xl">Extra Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
