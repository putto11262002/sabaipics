import { useState, useCallback } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { SidebarProvider, SidebarInset } from '@sabaipics/uiv3/components/sidebar';
import { ScrollArea } from '@sabaipics/uiv3/components/scroll-area';
import { PageHeader } from '../../../../components/shell/page-header';
import { useEvent } from '../../../../hooks/events/useEvent';
import type { SlideshowConfig, SlideshowBlock, SlideshowContext } from './types';
import { DEFAULT_CONFIG, getTemplate } from './lib/templates';
import { buildThemeCssVars } from './lib/color-utils';
import { createBlock } from './blocks/registry';
import { Canvas } from './components/canvas';
import { EditorSidebar } from './components/sidebar';
import { Toolbar } from './components/toolbar';

// ─── Recursive helpers ────────────────────────────────────────────────────────

function findBlock(blocks: SlideshowBlock[], id: string): SlideshowBlock | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.children) {
      const found = findBlock(block.children, id);
      if (found) return found;
    }
  }
  return null;
}

function findParentBlock(blocks: SlideshowBlock[], childId: string): SlideshowBlock | null {
  for (const block of blocks) {
    if (block.children?.some((c) => c.id === childId)) return block;
  }
  return null;
}

function updateBlockInTree(blocks: SlideshowBlock[], updated: SlideshowBlock): SlideshowBlock[] {
  return blocks.map((b) => {
    if (b.id === updated.id) return updated;
    if (b.children) {
      return { ...b, children: updateBlockInTree(b.children, updated) };
    }
    return b;
  });
}

function toggleBlockInTree(blocks: SlideshowBlock[], id: string): SlideshowBlock[] {
  return blocks.map((b) => {
    if (b.id === id) return { ...b, enabled: !b.enabled };
    if (b.children) {
      return { ...b, children: toggleBlockInTree(b.children, id) };
    }
    return b;
  });
}

function deleteBlockFromTree(blocks: SlideshowBlock[], id: string): SlideshowBlock[] {
  // First try top-level removal
  const filtered = blocks.filter((b) => b.id !== id);
  if (filtered.length !== blocks.length) return filtered;
  // Otherwise remove from children
  return blocks.map((b) => {
    if (b.children) {
      return { ...b, children: b.children.filter((c) => c.id !== id) };
    }
    return b;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventSlideshowTab() {
  const { id } = useParams<{ id: string }>();
  const { data } = useEvent(id);
  const [config, setConfig] = useState<SlideshowConfig>(() => structuredClone(DEFAULT_CONFIG));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const handleSelectBlock = useCallback((blockId: string) => {
    setSelectedBlockId((prev) => (prev === blockId ? prev : blockId));
  }, []);

  if (!data?.data) {
    return null;
  }

  const event = data.data;

  const context: SlideshowContext = {
    event: {
      id: id!,
      name: event.name,
      subtitle: (event as any).subtitle ?? null,
      logoUrl: null, // TODO: wire up when logo upload is integrated
    },
    stats: {
      photoCount: 0,
      searchCount: 0,
      downloadCount: 0,
    },
    photos: [],
  };

  const selectedBlock = selectedBlockId ? findBlock(config.blocks, selectedBlockId) : null;
  const parentBlock = selectedBlockId ? findParentBlock(config.blocks, selectedBlockId) : null;

  // ─── Block operations ────────────────────────────────────────────────

  const handleAddBlock = (type: string) => {
    const newBlock = createBlock(type);
    setConfig((prev) => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
    }));
    setSelectedBlockId(newBlock.id);
  };

  const handleReorder = (blocks: SlideshowBlock[]) => {
    setConfig((prev) => ({ ...prev, blocks }));
  };

  const handleReorderChildren = (parentId: string, newChildren: SlideshowBlock[]) => {
    setConfig((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === parentId ? { ...b, children: newChildren } : b)),
    }));
  };

  const handleAddPreset = (block: SlideshowBlock) => {
    setConfig((prev) => ({
      ...prev,
      blocks: [...prev.blocks, block],
    }));
    setSelectedBlockId(block.id);
  };

  const handleUpdateBlock = (updated: SlideshowBlock) => {
    setConfig((prev) => ({
      ...prev,
      blocks: updateBlockInTree(prev.blocks, updated),
    }));
  };

  const handleToggleBlock = () => {
    if (!selectedBlockId) return;
    setConfig((prev) => ({
      ...prev,
      blocks: toggleBlockInTree(prev.blocks, selectedBlockId),
    }));
  };

  const handleDeleteBlock = () => {
    if (!selectedBlockId) return;
    // If deleting a child, select the parent after deletion
    const parent = findParentBlock(config.blocks, selectedBlockId);
    setConfig((prev) => ({
      ...prev,
      blocks: deleteBlockFromTree(prev.blocks, selectedBlockId),
    }));
    setSelectedBlockId(parent ? parent.id : null);
  };

  const handleThemeChange = (theme: SlideshowConfig['theme']) => {
    setConfig((prev) => ({ ...prev, theme }));
  };

  const handleApplyTemplate = (key: string) => {
    setConfig(getTemplate(key));
    setSelectedBlockId(null);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedBlockId(null);
    }
  };

  const handleSave = () => {
    toast.success('Slideshow configuration saved');
  };

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
        <Toolbar
          onApplyTemplate={handleApplyTemplate}
          onAddBlock={handleAddBlock}
          onAddPreset={handleAddPreset}
          onSave={handleSave}
        />
      </PageHeader>

      <SidebarProvider
        defaultOpen={true}
        className="!min-h-0"
        style={{ '--sidebar-width': '320px', flex: 1 } as React.CSSProperties}
      >
        <SidebarInset className="min-h-0">
          <ScrollArea className="h-full">
            <div style={buildThemeCssVars(config.theme.primary, config.theme.background)}>
              <Canvas
                config={config}
                context={context}
                selectedBlockId={selectedBlockId}
                onSelectBlock={handleSelectBlock}
                onReorder={handleReorder}
                onReorderChildren={handleReorderChildren}
                onCanvasClick={handleCanvasClick}
              />
            </div>
          </ScrollArea>
        </SidebarInset>

        <EditorSidebar
          selectedBlock={selectedBlock}
          parentBlock={parentBlock}
          onUpdateBlock={handleUpdateBlock}
          onToggleBlock={handleToggleBlock}
          onDeleteBlock={handleDeleteBlock}
          onSelectBlock={handleSelectBlock}
          theme={config.theme}
          onThemeChange={handleThemeChange}
        />
      </SidebarProvider>
    </div>
  );
}
