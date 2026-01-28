import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useBlocker } from 'react-router';
import { toast } from 'sonner';
import { SidebarProvider, SidebarInset } from '@sabaipics/uiv3/components/sidebar';
import { ScrollArea } from '@sabaipics/uiv3/components/scroll-area';
import { Spinner } from '@sabaipics/uiv3/components/spinner';
import { Alert, AlertDescription } from '@sabaipics/uiv3/components/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sabaipics/uiv3/components/alert-dialog';
import { AlertCircle } from 'lucide-react';
import { PageHeader } from '../../../../components/shell/page-header';
import { useEvent } from '../../../../hooks/events/useEvent';
import { useSlideshowConfig, useUpdateSlideshowConfig } from '../../../../hooks/events/useSlideshowConfig';
import type { SlideshowConfig, SlideshowBlock, SlideshowContext } from './types';
import { DEFAULT_CONFIG } from './lib/templates';
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
  const { data: slideshowData, isLoading: isLoadingConfig, error: configError } = useSlideshowConfig(id);
  const updateConfig = useUpdateSlideshowConfig(id);
  const [config, setConfig] = useState<SlideshowConfig>(() => structuredClone(DEFAULT_CONFIG));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const hasSynced = useRef(false);

  useEffect(() => {
    if (slideshowData?.data && !hasSynced.current) {
      hasSynced.current = true;
      const fetched = slideshowData.data as SlideshowConfig;
      // If no blocks configured yet, seed with the classic template
      if (fetched.blocks.length === 0) {
        setConfig(structuredClone(DEFAULT_CONFIG));
      } else {
        setConfig(structuredClone(fetched));
      }
    }
  }, [slideshowData]);

  // ─── Unsaved changes guards ──────────────────────────────────────────

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleSelectBlock = useCallback((blockId: string) => {
    setSelectedBlockId((prev) => (prev === blockId ? prev : blockId));
  }, []);

  if (!data?.data) {
    return null;
  }

  const isLoading = isLoadingConfig;
  const hasError = !!configError;
  const event = data.data;

  const context: SlideshowContext = {
    event: {
      id: id!,
      name: event.name,
      subtitle: (event as any).subtitle ?? null,
      logoUrl: event.logoUrl ?? null,
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

  const updateAndDirty: typeof setConfig = (value) => {
    setConfig(value);
    setIsDirty(true);
  };

  const handleAddBlock = (type: string) => {
    const newBlock = createBlock(type);
    updateAndDirty((prev) => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
    }));
    setSelectedBlockId(newBlock.id);
  };

  const handleReorder = (blocks: SlideshowBlock[]) => {
    updateAndDirty((prev) => ({ ...prev, blocks }));
  };

  const handleReorderChildren = (parentId: string, newChildren: SlideshowBlock[]) => {
    updateAndDirty((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === parentId ? { ...b, children: newChildren } : b)),
    }));
  };

  const handleAddPreset = (block: SlideshowBlock) => {
    updateAndDirty((prev) => ({
      ...prev,
      blocks: [...prev.blocks, block],
    }));
    setSelectedBlockId(block.id);
  };

  const handleUpdateBlock = (updated: SlideshowBlock) => {
    updateAndDirty((prev) => ({
      ...prev,
      blocks: updateBlockInTree(prev.blocks, updated),
    }));
  };

  const handleToggleBlock = () => {
    if (!selectedBlockId) return;
    updateAndDirty((prev) => ({
      ...prev,
      blocks: toggleBlockInTree(prev.blocks, selectedBlockId),
    }));
  };

  const handleDeleteBlock = () => {
    if (!selectedBlockId) return;
    const parent = findParentBlock(config.blocks, selectedBlockId);
    updateAndDirty((prev) => ({
      ...prev,
      blocks: deleteBlockFromTree(prev.blocks, selectedBlockId),
    }));
    setSelectedBlockId(parent ? parent.id : null);
  };

  const handleThemeChange = (theme: SlideshowConfig['theme']) => {
    updateAndDirty((prev) => ({ ...prev, theme }));
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedBlockId(null);
    }
  };

  const handleSave = () => {
    updateConfig.mutate(config, {
      onSuccess: () => {
        setIsDirty(false);
        toast.success('Slideshow configuration saved');
      },
      onError: () => toast.error('Failed to save. Please try again.'),
    });
  };

  return (
    <>
      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. If you leave now, your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <PageHeader
        className="border-b"
        backHref={`/events/${id}/details`}
        breadcrumbs={[
          { label: 'Events', href: '/events' },
          { label: event.name, href: `/events/${id}/details` },
          { label: 'Slideshow Editor' },
        ]}
      >
        <Toolbar
          eventId={id!}
          onAddBlock={handleAddBlock}
          onAddPreset={handleAddPreset}
          onSave={handleSave}
          disabled={isLoading || hasError}
          isSaving={updateConfig.isPending}
        />
      </PageHeader>

      <SidebarProvider
        defaultOpen={true}
        className="!min-h-0"
        style={{ '--sidebar-width': '320px', flex: 1 } as React.CSSProperties}
      >
        <SidebarInset className="min-h-0">
          {isLoading ? (
            <div className="flex justify-center bg-muted/50 p-8">
              <Spinner className="size-6" />
            </div>
          ) : hasError ? (
            <div className="bg-muted/50 p-8">
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>Something went wrong. Please try again.</AlertDescription>
              </Alert>
            </div>
          ) : (
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
          )}
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
    </>
  );
}
