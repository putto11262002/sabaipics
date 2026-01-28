import { Button } from '@sabaipics/uiv3/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sabaipics/uiv3/components/dropdown-menu';
import { Save, Plus, Loader2 } from 'lucide-react';
import { blockRegistry, getTopLevelTypes } from '../blocks/registry';
import { blockPresets } from '../lib/presets';
import type { SlideshowBlock } from '../types';

interface ToolbarProps {
  onApplyTemplate: (key: string) => void;
  onAddBlock: (type: string) => void;
  onAddPreset: (block: SlideshowBlock) => void;
  onSave: () => void;
  disabled?: boolean;
  isSaving?: boolean;
}

export function Toolbar({ onApplyTemplate, onAddBlock, onAddPreset, onSave, disabled, isSaving }: ToolbarProps) {
  const types = getTopLevelTypes();

  return (
    <>
      <Select onValueChange={onApplyTemplate} disabled={disabled}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Choose template" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="classic">Classic</SelectItem>
          <SelectItem value="gallery">Gallery</SelectItem>
          <SelectItem value="minimal">Minimal</SelectItem>
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={disabled}>
            <Plus className="size-4" />
            Add Block
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
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
