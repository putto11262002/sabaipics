import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useBlocker } from 'react-router';
import { toast } from 'sonner';
import { SidebarProvider, SidebarInset } from '@/shared/components/ui/sidebar';
import { Spinner } from '@/shared/components/ui/spinner';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { AlertCircle } from 'lucide-react';
import { PageHeader } from '../../../../components/shell/page-header';
import { useEvent } from '../../../../hooks/events/useEvent';
import {
  useSlideshowConfig,
  useUpdateSlideshowConfig,
} from '../../../../hooks/events/useSlideshowConfig';
import type {
  SlideshowConfig,
  SlideshowBlock,
  SlideshowContext,
  DeviceType,
  Orientation,
  SlideshowLayout,
} from './types';

const DEFAULT_LAYOUT: SlideshowLayout = {
  gap: 'md',
  padding: 'md',
  align: 'start',
  maxWidth: 'none',
};
import { DEVICE_DEFAULT_ORIENTATION } from './types';
import { DEFAULT_CONFIG, TEMPLATES, type TemplateId } from './lib/templates';
import { createBlock, getBlockDef } from './blocks/registry';
import { IframeCanvas } from './components/iframe-canvas';
import { EditorSidebar } from './components/sidebar';
import { Toolbar } from './components/toolbar';

// ─── Feature Flags ────────────────────────────────────────────────────────────

const ENABLE_BLOCK_EDITING = false; // Set to true when drag-and-drop + click-to-edit are stable

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

function isLayoutBlock(block: SlideshowBlock): boolean {
  return getBlockDef(block.type)?.acceptsChildren === true;
}

function insertBlockAfter(
  blocks: SlideshowBlock[],
  targetId: string,
  newBlock: SlideshowBlock,
): SlideshowBlock[] {
  // Try inserting at root level
  const rootIndex = blocks.findIndex((b) => b.id === targetId);
  if (rootIndex !== -1) {
    const result = [...blocks];
    result.splice(rootIndex + 1, 0, newBlock);
    return result;
  }

  // Otherwise, insert as sibling in parent's children
  return blocks.map((b) => {
    if (b.children) {
      const childIndex = b.children.findIndex((c) => c.id === targetId);
      if (childIndex !== -1) {
        const newChildren = [...b.children];
        newChildren.splice(childIndex + 1, 0, newBlock);
        return { ...b, children: newChildren };
      }
    }
    return b;
  });
}

function addChildToBlock(
  blocks: SlideshowBlock[],
  parentId: string,
  newChild: SlideshowBlock,
): SlideshowBlock[] {
  return blocks.map((b) => {
    if (b.id === parentId) {
      return { ...b, children: [...(b.children ?? []), newChild] };
    }
    return b;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventSlideshowTab() {
  const { id } = useParams<{ id: string }>();
  const { data } = useEvent(id);
  const {
    data: slideshowData,
    isLoading: isLoadingConfig,
    error: configError,
  } = useSlideshowConfig(id);
  const updateConfig = useUpdateSlideshowConfig(id);

  // Editor mode - no photo fetching, use placeholders only
  // Live mode will fetch photos via useSlideshowPhotos in the gallery renderer

  const [config, setConfig] = useState<SlideshowConfig>(() => structuredClone(DEFAULT_CONFIG));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [deviceType, setDeviceType] = useState<DeviceType>('tv');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const hasSynced = useRef(false);

  // Update orientation to device default when device type changes
  const handleDeviceTypeChange = useCallback((type: DeviceType) => {
    setDeviceType(type);
    setOrientation(DEVICE_DEFAULT_ORIENTATION[type]);
  }, []);

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

  // For sidebar block selection (always a valid blockId)
  const handleSelectBlock = useCallback((blockId: string) => {
    setSelectedBlockId((prev) => (prev === blockId ? prev : blockId));
  }, []);

  // For iframe block selection (can be null to deselect)
  const handleIframeSelectBlock = useCallback((blockId: string | null) => {
    setSelectedBlockId(blockId);
  }, []);

  const handleConfigUpdate = useCallback((updatedConfig: SlideshowConfig) => {
    console.log('[EDITOR] Config updated from iframe - applying to state');
    setConfig(updatedConfig);
    setIsDirty(true);
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
    photos: [], // Always empty for editor - placeholders only
    liveMode: false, // Editor mode - no live fetching, use placeholders
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

    updateAndDirty((prev) => {
      // If a layout block is selected, add as child
      if (selectedBlock && isLayoutBlock(selectedBlock)) {
        return {
          ...prev,
          blocks: addChildToBlock(prev.blocks, selectedBlock.id, newBlock),
        };
      }

      // If any block is selected, add after it
      if (selectedBlockId) {
        return {
          ...prev,
          blocks: insertBlockAfter(prev.blocks, selectedBlockId, newBlock),
        };
      }

      // Otherwise append to end
      return {
        ...prev,
        blocks: [...prev.blocks, newBlock],
      };
    });

    setSelectedBlockId(newBlock.id);
  };

  const handleAddPreset = (block: SlideshowBlock) => {
    updateAndDirty((prev) => {
      // If a layout block is selected, add as child
      if (selectedBlock && isLayoutBlock(selectedBlock)) {
        return {
          ...prev,
          blocks: addChildToBlock(prev.blocks, selectedBlock.id, block),
        };
      }

      // If any block is selected, add after it
      if (selectedBlockId) {
        return {
          ...prev,
          blocks: insertBlockAfter(prev.blocks, selectedBlockId, block),
        };
      }

      // Otherwise append to end
      return {
        ...prev,
        blocks: [...prev.blocks, block],
      };
    });

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

  const handleLayoutChange = (layout: SlideshowLayout) => {
    updateAndDirty((prev) => ({ ...prev, layout }));
  };

  const handleApplyTemplate = (templateId: TemplateId) => {
    const template = TEMPLATES[templateId]();
    updateAndDirty(template);
    setSelectedBlockId(null); // Deselect after applying template
    toast.success('Template applied');
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
            deviceType={deviceType}
            orientation={orientation}
            onDeviceTypeChange={handleDeviceTypeChange}
            onOrientationChange={setOrientation}
            onAddBlock={handleAddBlock}
            onAddPreset={handleAddPreset}
            onSave={handleSave}
            disabled={isLoading || hasError}
            isSaving={updateConfig.isPending}
            showAddBlock={ENABLE_BLOCK_EDITING}
          />
        </PageHeader>

        <SidebarProvider
          defaultOpen={true}
          className="!min-h-0"
          style={{ '--sidebar-width': '320px', flex: 1 } as React.CSSProperties}
        >
          <SidebarInset className="min-h-0">
            {isLoading ? (
              <div className="flex h-full items-center justify-center bg-muted/50 p-8">
                <Spinner className="size-6" />
              </div>
            ) : hasError ? (
              <div className="flex h-full items-center justify-center bg-muted/50 p-8">
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>Something went wrong. Please try again.</AlertDescription>
                </Alert>
              </div>
            ) : (
              <IframeCanvas
                config={config}
                context={context}
                selectedBlockId={ENABLE_BLOCK_EDITING ? selectedBlockId : null}
                deviceType={deviceType}
                orientation={orientation}
                onSelectBlock={ENABLE_BLOCK_EDITING ? handleIframeSelectBlock : () => {}}
                onConfigUpdate={ENABLE_BLOCK_EDITING ? handleConfigUpdate : undefined}
              />
            )}
          </SidebarInset>

          <EditorSidebar
            selectedBlock={ENABLE_BLOCK_EDITING ? selectedBlock : null}
            parentBlock={ENABLE_BLOCK_EDITING ? parentBlock : null}
            onUpdateBlock={handleUpdateBlock}
            onToggleBlock={handleToggleBlock}
            onDeleteBlock={handleDeleteBlock}
            onSelectBlock={handleSelectBlock}
            theme={config.theme}
            onThemeChange={handleThemeChange}
            layout={config.layout ?? DEFAULT_LAYOUT}
            onLayoutChange={handleLayoutChange}
            onApplyTemplate={handleApplyTemplate}
          />
        </SidebarProvider>
      </div>
    </>
  );
}
