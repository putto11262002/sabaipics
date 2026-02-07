import { Label } from '@sabaipics/uiv3/components/label';
import { Checkbox } from '@sabaipics/uiv3/components/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import type { SlideshowBlock, StatsPanelProps, StatsPanelVariant } from '../../types';

export function StatsPanelSettings({
  block,
  onChange,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
}) {
  const props = block.props as StatsPanelProps;

  const update = (patch: Partial<StatsPanelProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  const toggleMetric = (metric: 'photos' | 'downloads' | 'searches') => {
    const newMetrics = props.metrics.includes(metric)
      ? props.metrics.filter((m) => m !== metric)
      : [...props.metrics, metric];
    update({ metrics: newMetrics });
  };

  return (
    <div className="space-y-4">
      {/* Variant selector */}
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Style</Label>
        <Select value={props.variant} onValueChange={(v) => update({ variant: v as StatsPanelVariant })}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cards">Cards</SelectItem>
            <SelectItem value="compact">Compact</SelectItem>
            <SelectItem value="vertical">Vertical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metrics checkboxes */}
      <div className="space-y-2">
        <Label className="text-xs">Metrics</Label>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="photos"
              checked={props.metrics.includes('photos')}
              onCheckedChange={() => toggleMetric('photos')}
            />
            <Label htmlFor="photos" className="text-sm font-normal cursor-pointer">
              Photo Count
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="searches"
              checked={props.metrics.includes('searches')}
              onCheckedChange={() => toggleMetric('searches')}
            />
            <Label htmlFor="searches" className="text-sm font-normal cursor-pointer">
              Search Count
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="downloads"
              checked={props.metrics.includes('downloads')}
              onCheckedChange={() => toggleMetric('downloads')}
            />
            <Label htmlFor="downloads" className="text-sm font-normal cursor-pointer">
              Download Count
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}
