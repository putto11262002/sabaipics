import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@sabaipics/uiv3/components/sidebar';
import { ScrollArea } from '@sabaipics/uiv3/components/scroll-area';
import { Button } from '@sabaipics/uiv3/components/button';
import { Switch } from '@sabaipics/uiv3/components/switch';
import { Label } from '@sabaipics/uiv3/components/label';
import { Trash2, ChevronLeft } from 'lucide-react';
import type { SlideshowBlock, SlideshowTheme } from '../types';
import { getBlockDef } from '../blocks/registry';
import { ThemeSettings } from './theme-settings';

interface EditorSidebarProps {
  selectedBlock: SlideshowBlock | null;
  parentBlock: SlideshowBlock | null;
  onUpdateBlock: (updated: SlideshowBlock) => void;
  onToggleBlock: () => void;
  onDeleteBlock: () => void;
  onSelectBlock: (id: string) => void;
  theme: SlideshowTheme;
  onThemeChange: (theme: SlideshowTheme) => void;
}

export function EditorSidebar({
  selectedBlock,
  parentBlock,
  onUpdateBlock,
  onToggleBlock,
  onDeleteBlock,
  onSelectBlock,
  theme,
  onThemeChange,
}: EditorSidebarProps) {
  const blockDef = selectedBlock ? getBlockDef(selectedBlock.type) : undefined;
  const parentDef = parentBlock ? getBlockDef(parentBlock.type) : undefined;

  return (
    <Sidebar side="right" collapsible="none" className="border-l">
      <SidebarHeader className="border-sidebar-border border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{blockDef ? blockDef.label : 'Theme'}</h3>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="h-full">
          <div className="px-4 py-4">
            {selectedBlock && blockDef ? (
              <div className="space-y-4">
                {/* Back to parent button when a child is selected */}
                {parentBlock && parentDef && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                    onClick={() => onSelectBlock(parentBlock.id)}
                  >
                    <ChevronLeft className="size-3" />
                    Back to {parentDef.label}
                  </Button>
                )}

                {/* Enable/Disable toggle */}
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Enabled</Label>
                  <Switch checked={selectedBlock.enabled} onCheckedChange={onToggleBlock} />
                </div>

                {/* Block-specific settings */}
                <div className="space-y-3">
                  <blockDef.SettingsPanel
                    block={selectedBlock}
                    onChange={onUpdateBlock}
                    onSelectBlock={onSelectBlock}
                  />
                </div>
              </div>
            ) : (
              <ThemeSettings theme={theme} onChange={onThemeChange} />
            )}
          </div>
        </ScrollArea>
      </SidebarContent>

      {selectedBlock && (
        <SidebarFooter className="p-4">
          <Button variant="destructive" size="sm" onClick={onDeleteBlock} className="w-full gap-2">
            <Trash2 className="size-4" />
            Remove Block
          </Button>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
