import { Link } from 'react-router';
import { Button } from '@/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/ui/components/toggle-group';
import { Save, Plus, Loader2, Eye, Tv, Monitor, Tablet, Smartphone, RotateCcw } from 'lucide-react';
import { blockRegistry, getTopLevelTypes } from '../blocks/registry';
import { blockPresets } from '../lib/presets';
import type { SlideshowBlock, DeviceType, Orientation } from '../types';

interface ToolbarProps {
  eventId: string;
  deviceType: DeviceType;
  orientation: Orientation;
  onDeviceTypeChange: (type: DeviceType) => void;
  onOrientationChange: (orientation: Orientation) => void;
  onAddBlock: (type: string) => void;
  onAddPreset: (block: SlideshowBlock) => void;
  onSave: () => void;
  disabled?: boolean;
  isSaving?: boolean;
  showAddBlock?: boolean;
}

export function Toolbar({
  eventId,
  deviceType,
  orientation,
  onDeviceTypeChange,
  onOrientationChange,
  onAddBlock,
  onAddPreset,
  onSave,
  disabled,
  isSaving,
  showAddBlock = true,
}: ToolbarProps) {
  const types = getTopLevelTypes();

  const handleRotate = () => {
    onOrientationChange(orientation === 'landscape' ? 'portrait' : 'landscape');
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" asChild>
        <Link to={`/events/${eventId}/slideshow-preview`} target="_blank">
          <Eye className="size-4" />
          Preview
        </Link>
      </Button>

      <ToggleGroup
        type="single"
        value={deviceType}
        onValueChange={(value) => value && onDeviceTypeChange(value as DeviceType)}
        size="sm"
      >
        <ToggleGroupItem value="tv" aria-label="TV view">
          <Tv className="size-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="monitor" aria-label="Monitor view">
          <Monitor className="size-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="tablet" aria-label="Tablet view">
          <Tablet className="size-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="phone" aria-label="Phone view">
          <Smartphone className="size-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      <Button
        variant="outline"
        size="sm"
        onClick={handleRotate}
        aria-label="Rotate device"
        title={`Rotate to ${orientation === 'landscape' ? 'portrait' : 'landscape'}`}
      >
        <RotateCcw className="size-4" />
      </Button>

      {showAddBlock && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={disabled}>
              <Plus className="size-4" />
              Add Block
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-[180px]">
            <DropdownMenuLabel className="text-xs">Blocks</DropdownMenuLabel>
            {types.map((type) => {
              const def = blockRegistry.get(type)!;
              const Icon = def.icon;
              return (
                <DropdownMenuItem key={type} onClick={() => onAddBlock(type)}>
                  <Icon className="size-4" />
                  <span className="ml-2">{def.label}</span>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Presets</DropdownMenuLabel>
            {blockPresets.map((preset) => {
              const Icon = preset.icon;
              return (
                <DropdownMenuItem key={preset.key} onClick={() => onAddPreset(preset.create())}>
                  <Icon className="size-4" />
                  <span className="ml-2">{preset.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Button size="sm" onClick={onSave} className="gap-1.5" disabled={disabled || isSaving}>
        {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {isSaving ? 'Saving...' : 'Save'}
      </Button>
    </>
  );
}
