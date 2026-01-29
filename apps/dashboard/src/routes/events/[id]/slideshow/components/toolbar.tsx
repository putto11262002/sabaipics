import { Link } from 'react-router';
import { Button } from '@sabaipics/uiv3/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sabaipics/uiv3/components/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@sabaipics/uiv3/components/toggle-group';
import { Save, Plus, Loader2, Eye, Monitor, Tablet, Smartphone } from 'lucide-react';
import { blockRegistry, getTopLevelTypes } from '../blocks/registry';
import { blockPresets } from '../lib/presets';
import type { SlideshowBlock, DeviceMode } from '../types';

interface ToolbarProps {
  eventId: string;
  deviceMode: DeviceMode;
  onDeviceModeChange: (mode: DeviceMode) => void;
  onAddBlock: (type: string) => void;
  onAddPreset: (block: SlideshowBlock) => void;
  onSave: () => void;
  disabled?: boolean;
  isSaving?: boolean;
}

export function Toolbar({
  eventId,
  deviceMode,
  onDeviceModeChange,
  onAddBlock,
  onAddPreset,
  onSave,
  disabled,
  isSaving,
}: ToolbarProps) {
  const types = getTopLevelTypes();

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
        value={deviceMode}
        onValueChange={(value) => value && onDeviceModeChange(value as DeviceMode)}
        size="sm"
      >
        <ToggleGroupItem value="desktop" aria-label="Desktop view">
          <Monitor className="size-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="tablet" aria-label="Tablet view">
          <Tablet className="size-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="mobile" aria-label="Mobile view">
          <Smartphone className="size-4" />
        </ToggleGroupItem>
      </ToggleGroup>

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

      <Button size="sm" onClick={onSave} className="gap-1.5" disabled={disabled || isSaving}>
        {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {isSaving ? 'Saving...' : 'Save'}
      </Button>
    </>
  );
}
