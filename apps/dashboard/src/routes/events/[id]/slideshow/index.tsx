import { useState, useCallback } from 'react';
import { useParams } from 'react-router';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
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
  DropdownMenuTrigger,
} from '@sabaipics/uiv3/components/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@sabaipics/uiv3/components/popover';
import { Label } from '@sabaipics/uiv3/components/label';
import {
  Save,
  ExternalLink,
  Plus,
  Type,
  LayoutGrid,
  QrCode,
  BarChart3,
  Share2,
  Palette,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../../../../components/shell/page-header';
import { useEvent } from '../../../../hooks/events/useEvent';
import type { SlideshowConfig, SlideshowBlock, BlockType } from './types';
import { DEFAULT_CONFIG, TEMPLATES } from './defaults';
import { CanvasBlock, BlockContent } from './canvas-block';
import { EditorSidebar } from './editor-sidebar';
import { SidebarProvider, SidebarInset } from '@sabaipics/uiv3/components/sidebar';
import { ScrollArea } from '@sabaipics/uiv3/components/scroll-area';
import { buildThemeCssVars } from './color-utils';

const BLOCK_META: Record<BlockType, { label: string; icon: React.ReactNode }> = {
  header: { label: 'Header', icon: <Type className="size-4" /> },
  gallery: { label: 'Gallery', icon: <LayoutGrid className="size-4" /> },
  qr: { label: 'QR Code', icon: <QrCode className="size-4" /> },
  stats: { label: 'Statistics', icon: <BarChart3 className="size-4" /> },
  social: { label: 'Social Links', icon: <Share2 className="size-4" /> },
};

const DEFAULT_BLOCK_PROPS: Record<BlockType, SlideshowBlock['props']> = {
  header: { align: 'center' as const, showLogo: true, showName: true },
  gallery: { density: 'm' as const, autoplaySpeed: 0 },
  qr: { size: 'm' as const, label: 'Scan to find your photos' },
  stats: { show: ['photos', 'downloads'] as ('photos' | 'downloads' | 'searches')[] },
  social: { links: [], showIcons: true },
};

export default function EventSlideshowTab() {
  const { id } = useParams<{ id: string }>();
  const { data } = useEvent(id);
  const [config, setConfig] = useState<SlideshowConfig>(structuredClone(DEFAULT_CONFIG));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const handleSelectBlock = useCallback((blockId: string) => {
    setSelectedBlockId((prev) => (prev === blockId ? prev : blockId));
  }, []);

  if (!data?.data) {
    return null;
  }

  const event = data.data;
  const selectedBlock = selectedBlockId
    ? (config.layout.find((b) => b.id === selectedBlockId) ?? null)
    : null;

  const applyTemplate = (templateKey: string) => {
    const template = TEMPLATES[templateKey];
    if (template) {
      setConfig(structuredClone(template));
      setSelectedBlockId(null);
    }
  };

  const handleSave = () => {
    toast.success('Slideshow configuration saved');
  };

  const handlePreview = () => {
    window.open(`/events/${id}/slideshow/preview`, '_blank');
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setConfig((prev) => {
      const oldIndex = prev.layout.findIndex((b) => b.id === active.id);
      const newIndex = prev.layout.findIndex((b) => b.id === over.id);
      return { ...prev, layout: arrayMove(prev.layout, oldIndex, newIndex) };
    });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Only deselect if clicking the canvas background directly
    if (e.target === e.currentTarget) {
      setSelectedBlockId(null);
    }
  };

  const handleUpdateBlockProps = (props: SlideshowBlock['props']) => {
    if (!selectedBlockId) return;
    setConfig((prev) => ({
      ...prev,
      layout: prev.layout.map((b) => (b.id === selectedBlockId ? { ...b, props } : b)),
    }));
  };

  const handleToggleBlock = () => {
    if (!selectedBlockId) return;
    setConfig((prev) => ({
      ...prev,
      layout: prev.layout.map((b) =>
        b.id === selectedBlockId ? { ...b, enabled: !b.enabled } : b,
      ),
    }));
  };

  const handleDeleteBlock = () => {
    if (!selectedBlockId) return;
    setConfig((prev) => ({
      ...prev,
      layout: prev.layout.filter((b) => b.id !== selectedBlockId),
    }));
    setSelectedBlockId(null);
  };

  const handleAddBlock = (type: BlockType) => {
    const newBlock: SlideshowBlock = {
      id: `${type}-${Date.now()}`,
      type,
      enabled: true,
      props: structuredClone(DEFAULT_BLOCK_PROPS[type]),
    };
    setConfig((prev) => ({
      ...prev,
      layout: [...prev.layout, newBlock],
    }));
    setSelectedBlockId(newBlock.id);
  };

  const handleThemeChange = (theme: SlideshowConfig['theme']) => {
    setConfig((prev) => ({ ...prev, theme }));
  };

  // Find block types not currently in layout (for "Add Block" menu)
  const existingTypes = new Set(config.layout.map((b) => b.type));
  const addableTypes = (Object.keys(BLOCK_META) as BlockType[]).filter(
    (t) => !existingTypes.has(t),
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <PageHeader
        backHref={`/events/${id}/details`}
        breadcrumbs={[
          { label: 'Events', href: '/events' },
          { label: event.name, href: `/events/${id}/details` },
          { label: 'Slideshow Editor' },
        ]}
      >
        <Select onValueChange={applyTemplate}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Choose template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="classic">Classic</SelectItem>
            <SelectItem value="gallery">Gallery</SelectItem>
            <SelectItem value="minimal">Minimal</SelectItem>
          </SelectContent>
        </Select>

        {addableTypes.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="size-4" />
                Add Block
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {addableTypes.map((type) => (
                <DropdownMenuItem key={type} onClick={() => handleAddBlock(type)}>
                  {BLOCK_META[type].icon}
                  <span className="ml-2">{BLOCK_META[type].label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Palette className="size-4" />
              <div className="flex -space-x-1">
                <div
                  className="size-4 rounded-full border"
                  style={{ backgroundColor: config.theme.primary }}
                />
                <div
                  className="size-4 rounded-full border"
                  style={{ backgroundColor: config.theme.background }}
                />
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-3">
              <p className="text-sm font-medium">Theme Colors</p>
              <div className="flex items-center gap-3">
                <Label className="w-20 text-xs">Primary</Label>
                <input
                  type="color"
                  value={config.theme.primary}
                  onChange={(e) => handleThemeChange({ ...config.theme, primary: e.target.value })}
                  className="h-8 w-8 cursor-pointer rounded border border-border"
                />
                <span className="font-mono text-xs text-muted-foreground">
                  {config.theme.primary}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Label className="w-20 text-xs">Background</Label>
                <input
                  type="color"
                  value={config.theme.background}
                  onChange={(e) =>
                    handleThemeChange({ ...config.theme, background: e.target.value })
                  }
                  className="h-8 w-8 cursor-pointer rounded border border-border"
                />
                <span className="font-mono text-xs text-muted-foreground">
                  {config.theme.background}
                </span>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button variant="outline" size="sm" onClick={handlePreview} className="gap-1.5">
          <ExternalLink className="size-4" />
          Preview
        </Button>
        <Button size="sm" onClick={handleSave} className="gap-1.5">
          <Save className="size-4" />
          Save
        </Button>
      </PageHeader>

      <SidebarProvider
        defaultOpen={true}
        className="!min-h-0"
        style={{ '--sidebar-width': '320px', flex: 1 } as React.CSSProperties}
      >
        <SidebarInset className="min-h-0">
          <ScrollArea className="h-full">
            {/* Canvas */}
            <div
              className="flex min-h-full justify-center bg-muted/50 p-8"
              onClick={handleCanvasClick}
            >
              <div
                className="w-full max-w-3xl rounded-xl border bg-background p-6 shadow-sm"
                style={buildThemeCssVars(config.theme.primary, config.theme.background)}
                onClick={handleCanvasClick}
              >
                {config.layout.length === 0 ? (
                  <div className="flex h-64 items-center justify-center">
                    <p className="text-sm text-muted-foreground">
                      No blocks yet. Use &quot;Add Block&quot; to get started.
                    </p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={config.layout.map((b) => b.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1">
                        {config.layout.map((block) => (
                          <CanvasBlock
                            key={block.id}
                            block={block}
                            isSelected={selectedBlockId === block.id}
                            onSelect={handleSelectBlock}
                            theme={config.theme}
                            eventName={event.name}
                          />
                        ))}
                      </div>
                    </SortableContext>
                    <DragOverlay>
                      {activeDragId ? (
                        <div className="rounded-lg border border-blue-500 bg-background px-6 py-5 opacity-80 shadow-lg">
                          <BlockContent
                            block={config.layout.find((b) => b.id === activeDragId)!}
                            theme={config.theme}
                            eventName={event.name}
                          />
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                )}
              </div>
            </div>
          </ScrollArea>
        </SidebarInset>

        <EditorSidebar
          selectedBlock={selectedBlock}
          onUpdate={handleUpdateBlockProps}
          onToggle={handleToggleBlock}
          onDelete={handleDeleteBlock}
          theme={config.theme}
          onThemeChange={handleThemeChange}
        />
      </SidebarProvider>
    </div>
  );
}
