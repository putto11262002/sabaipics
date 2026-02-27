import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/shared/components/ui/sidebar';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Button } from '@/shared/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/label';
import { Separator } from '@/shared/components/ui/separator';
import { Trash2, ChevronLeft } from 'lucide-react';
import type { SlideshowBlock, SlideshowTheme, SlideshowLayout } from '../types';
import { getBlockDef } from '../blocks/registry';
import { ThemeSettings } from './theme-settings';
import { LayoutSettings } from './layout-settings';
import { TemplateSettings } from './template-settings';
import type { TemplateId } from '../lib/templates';

interface EditorSidebarProps {
  selectedBlock: SlideshowBlock | null;
  parentBlock: SlideshowBlock | null;
  onUpdateBlock: (updated: SlideshowBlock) => void;
  onToggleBlock: () => void;
  onDeleteBlock: () => void;
  onSelectBlock: (id: string) => void;
  theme: SlideshowTheme;
  onThemeChange: (theme: SlideshowTheme) => void;
  layout: SlideshowLayout;
  onLayoutChange: (layout: SlideshowLayout) => void;
  onApplyTemplate: (templateId: TemplateId) => void;
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
  layout,
  onLayoutChange,
  onApplyTemplate,
}: EditorSidebarProps) {
  const blockDef = selectedBlock ? getBlockDef(selectedBlock.type) : undefined;
  const parentDef = parentBlock ? getBlockDef(parentBlock.type) : undefined;

  return (
    <Sidebar side="right" collapsible="none" className="">
      <SidebarHeader className="border-sidebar-border border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{blockDef ? blockDef.label : 'Settings'}</h3>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="h-full">
          <div className="px-4 py-4">
            {selectedBlock && blockDef ? (
              <div className="space-y-4">
                {/* Back to parent button when a child is selected */}
                {parentBlock && parentDef && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7"
                    onClick={() => onSelectBlock(parentBlock.id)}
                  >
                    <ChevronLeft className="size-3" />
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
              <div className="space-y-6">
                <div>
                  <h4 className="mb-3 text-xs font-medium text-muted-foreground">Template</h4>
                  <TemplateSettings onApplyTemplate={onApplyTemplate} />
                </div>
                <Separator />
                <div>
                  <h4 className="mb-3 text-xs font-medium text-muted-foreground">Theme</h4>
                  <ThemeSettings theme={theme} onChange={onThemeChange} />
                </div>
                <Separator />
                <div>
                  <h4 className="mb-3 text-xs font-medium text-muted-foreground">Layout</h4>
                  <LayoutSettings layout={layout} onChange={onLayoutChange} />
                </div>
              </div>
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
