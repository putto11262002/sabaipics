import { useParams, useSearchParams } from 'react-router';
import { useState, useEffect, useCallback, useId } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Spinner } from '@/ui/components/ui/spinner';
import { Alert, AlertDescription } from '@/ui/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/ui/lib/utils';
import type { SlideshowConfig, SlideshowContext, SlideshowBlock, FlexProps, SlideshowLayout } from './types';
import { DEFAULT_CONFIG } from './lib/templates';
import { buildThemeCssVars } from './lib/color-utils';
import { getBlockDef } from './blocks/registry';
import { usePublicSlideshow } from './hooks/usePublicSlideshow';
import { gapClass, paddingClass, maxWidthClass, alignItemsClass } from './lib/spacing';

// ─── Layout defaults (for backwards compatibility) ─────────────────────────────

const DEFAULT_LAYOUT: SlideshowLayout = {
  gap: 'md',
  padding: 'md',
  align: 'start',
  maxWidth: 'none',
};

function getLayout(config: SlideshowConfig): SlideshowLayout {
  return config.layout ?? DEFAULT_LAYOUT;
}

// ─── Types for postMessage communication ───────────────────────────────────────

interface EditorConfigMessage {
  type: 'slideshow-config';
  config: SlideshowConfig;
  context: SlideshowContext;
  selectedBlockId: string | null;
}

interface BlockSelectedMessage {
  type: 'block-selected';
  blockId: string;
}

interface ConfigUpdatedMessage {
  type: 'config-updated';
  config: SlideshowConfig;
}

// ─── Sortable Block Wrapper (for editor mode) ──────────────────────────────────

interface SortableBlockProps {
  block: SlideshowBlock;
  context: SlideshowContext;
  isSelected: boolean;
  onSelect: (id: string) => void;
  selectedBlockId: string | null;
  containerId: string; // 'root' or parent block id
  isOver?: boolean; // drop indicator
  isActiveContainer?: boolean; // container being dragged into
  overChildId?: string | null; // which child in this layout is being hovered
}

function SortableBlock({
  block,
  context,
  isSelected,
  onSelect,
  selectedBlockId,
  containerId,
  isOver,
  isActiveContainer,
  overChildId,
}: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: {
      type: 'block',
      block,
      containerId,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const def = getBlockDef(block.type);
  if (!def) return null;

  const isChildSelected = block.children?.some((c) => c.id === selectedBlockId) ?? false;
  const highlighted = isSelected || isChildSelected;
  const isLayout = def.acceptsChildren === true;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative w-full cursor-grab active:cursor-grabbing',
        // Selection highlight
        highlighted
          ? 'outline outline-2 outline-blue-500'
          : 'hover:outline hover:outline-1 hover:outline-blue-300',
        !block.enabled && 'opacity-40',
        isDragging && 'opacity-50',
        // Container highlight when dragging into it
        isLayout && isActiveContainer && 'ring-2 ring-green-500 ring-offset-2',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
      {...attributes}
      {...listeners}
    >
      {/* Drop indicator line */}
      {isOver && !isLayout && (
        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-blue-500" />
      )}

      {/* Block type label */}
      <div
        className={cn(
          'absolute -top-5 left-0 text-[10px] font-medium leading-none transition-opacity',
          highlighted
            ? 'text-blue-500 opacity-100'
            : 'text-muted-foreground opacity-0 group-hover:opacity-100',
        )}
      >
        {def.label}
      </div>

      {isLayout ? (
        <LayoutBlockContent
          block={block}
          context={context}
          selectedBlockId={selectedBlockId}
          onSelect={onSelect}
          isActiveContainer={isActiveContainer}
          overChildId={overChildId}
        />
      ) : (
        <def.Renderer block={block} context={context} />
      )}
    </div>
  );
}

// ─── Layout Block Content (handles nested sortable children) ────────────────────

interface LayoutBlockContentProps {
  block: SlideshowBlock;
  context: SlideshowContext;
  selectedBlockId: string | null;
  onSelect: (id: string) => void;
  isActiveContainer?: boolean;
  overChildId?: string | null;
}

function LayoutBlockContent({
  block,
  context,
  selectedBlockId,
  onSelect,
  isActiveContainer,
  overChildId,
}: LayoutBlockContentProps) {
  const props = block.props as FlexProps;
  const children = block.children ?? [];
  const enabledChildren = children.filter((c) => c.enabled);

  return (
    <div
      className={cn(
        'flex min-h-[40px]', // min-height to allow dropping into empty layouts
        props.direction === 'column' ? 'flex-col' : 'flex-row',
        props.wrap && 'flex-wrap',
        props.align === 'center' && 'items-center',
        props.align === 'start' && 'items-start',
        props.align === 'end' && 'items-end',
        props.justify === 'center' && 'justify-center',
        props.justify === 'start' && 'justify-start',
        props.justify === 'end' && 'justify-end',
        props.justify === 'between' && 'justify-between',
        gapClass[props.gap],
        paddingClass[props.padding],
        // Dashed border when dragging and container is a valid target
        isActiveContainer && 'border-2 border-dashed border-green-500',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
    >
      {enabledChildren.length === 0 && isActiveContainer && (
        <div className="flex h-10 w-full items-center justify-center text-xs text-green-600">
          Drop here
        </div>
      )}
      <SortableContext
        items={enabledChildren.map((c) => c.id)}
        strategy={props.direction === 'row' ? horizontalListSortingStrategy : verticalListSortingStrategy}
      >
        {enabledChildren.map((child) => (
          <SortableChildBlock
            key={child.id}
            block={child}
            parentId={block.id}
            context={context}
            isSelected={selectedBlockId === child.id}
            onSelect={onSelect}
            isOver={overChildId === child.id}
            direction={props.direction}
          />
        ))}
      </SortableContext>
    </div>
  );
}

// ─── Sortable Child Block ───────────────────────────────────────────────────────

interface SortableChildBlockProps {
  block: SlideshowBlock;
  parentId: string;
  context: SlideshowContext;
  isSelected: boolean;
  onSelect: (id: string) => void;
  isOver?: boolean;
  direction?: 'row' | 'column';
}

function SortableChildBlock({
  block,
  parentId,
  context,
  isSelected,
  onSelect,
  isOver,
  direction = 'row',
}: SortableChildBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: {
      type: 'child-block',
      block,
      containerId: parentId,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const def = getBlockDef(block.type);
  if (!def) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/child relative cursor-grab active:cursor-grabbing',
        isSelected
          ? 'outline outline-2 outline-blue-500'
          : 'hover:outline hover:outline-1 hover:outline-blue-300',
        !block.enabled && 'opacity-40',
        isDragging && 'opacity-50',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
      {...attributes}
      {...listeners}
    >
      {/* Drop indicator line */}
      {isOver && (
        <div
          className={cn(
            'absolute bg-blue-500',
            direction === 'row'
              ? '-left-1 top-0 bottom-0 w-0.5'
              : '-top-1 left-0 right-0 h-0.5',
          )}
        />
      )}
      <def.Renderer block={block} context={context} />
    </div>
  );
}

// ─── Helper functions for drag operations ──────────────────────────────────────

function removeBlockFromTree(blocks: SlideshowBlock[], blockId: string): SlideshowBlock[] {
  // Try removing from root level
  const filtered = blocks.filter((b) => b.id !== blockId);
  if (filtered.length !== blocks.length) return filtered;

  // Remove from children
  return blocks.map((b) => {
    if (b.children) {
      return { ...b, children: b.children.filter((c) => c.id !== blockId) };
    }
    return b;
  });
}

function addBlockToContainer(
  blocks: SlideshowBlock[],
  block: SlideshowBlock,
  containerId: string,
  index: number,
): SlideshowBlock[] {
  if (containerId === 'root') {
    const result = [...blocks];
    result.splice(index, 0, block);
    return result;
  }

  return blocks.map((b) => {
    if (b.id === containerId) {
      const children = [...(b.children ?? [])];
      children.splice(index, 0, block);
      return { ...b, children };
    }
    return b;
  });
}

// ─── Editor Mode Component ─────────────────────────────────────────────────────

function EditorModePreview() {
  const dndId = useId();
  const [config, setConfig] = useState<SlideshowConfig | null>(null);
  const [context, setContext] = useState<SlideshowContext | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Drag state for visual feedback
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overContainerId, setOverContainerId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Listen for config from parent editor
  useEffect(() => {
    const handler = (event: MessageEvent<EditorConfigMessage>) => {
      if (event.data.type === 'slideshow-config') {
        setConfig(event.data.config);
        setContext(event.data.context);
        setSelectedBlockId(event.data.selectedBlockId);
      }
    };
    window.addEventListener('message', handler);

    // Signal to parent that iframe is ready
    window.parent.postMessage({ type: 'iframe-ready' }, '*');

    return () => window.removeEventListener('message', handler);
  }, []);

  // Notify parent when a block is clicked
  const handleSelectBlock = useCallback((blockId: string) => {
    window.parent.postMessage({ type: 'block-selected', blockId } satisfies BlockSelectedMessage, '*');
  }, []);

  // Deselect when clicking canvas background
  const handleCanvasClick = useCallback(() => {
    window.parent.postMessage({ type: 'block-selected', blockId: '' } satisfies BlockSelectedMessage, '*');
  }, []);

  // Track drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  // Track drag over for visual feedback
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      setOverId(over.id as string);
      const overData = over.data.current as { containerId?: string } | undefined;
      setOverContainerId(overData?.containerId ?? 'root');
    } else {
      setOverId(null);
      setOverContainerId(null);
    }
  }, []);

  // Unified drag end handler for all block moves
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    // Reset drag state
    setActiveId(null);
    setOverId(null);
    setOverContainerId(null);

    const { active, over } = event;
    if (!over || !config) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    const activeData = active.data.current as { containerId: string; block: SlideshowBlock } | undefined;
    const overData = over.data.current as { containerId: string; block?: SlideshowBlock } | undefined;

    if (!activeData) return;

    const sourceContainerId = activeData.containerId;
    const targetContainerId = overData?.containerId ?? 'root';

    // Get the block being dragged
    const draggedBlock = activeData.block;
    if (!draggedBlock) return;

    let newBlocks = config.blocks;

    // Same container - reorder
    if (sourceContainerId === targetContainerId) {
      if (sourceContainerId === 'root') {
        // Reorder root blocks
        const oldIndex = newBlocks.findIndex((b) => b.id === activeId);
        const newIndex = newBlocks.findIndex((b) => b.id === overId);
        if (oldIndex !== -1 && newIndex !== -1) {
          newBlocks = arrayMove(newBlocks, oldIndex, newIndex);
        }
      } else {
        // Reorder within same layout
        newBlocks = newBlocks.map((b) => {
          if (b.id === sourceContainerId && b.children) {
            const oldIndex = b.children.findIndex((c) => c.id === activeId);
            const newIndex = b.children.findIndex((c) => c.id === overId);
            if (oldIndex !== -1 && newIndex !== -1) {
              return { ...b, children: arrayMove(b.children, oldIndex, newIndex) };
            }
          }
          return b;
        });
      }
    } else {
      // Cross-container move
      // 1. Validate target exists first
      let targetIndex = 0;
      if (targetContainerId === 'root') {
        // Root always exists
        targetIndex = newBlocks.findIndex((b) => b.id === overId);
        if (targetIndex === -1) targetIndex = newBlocks.length;
      } else {
        // Validate target parent exists
        const targetParent = newBlocks.find((b) => b.id === targetContainerId);
        if (!targetParent) {
          console.warn(`Target container ${targetContainerId} not found, aborting move`);
          return; // Abort - don't remove the block
        }
        if (targetParent.children) {
          targetIndex = targetParent.children.findIndex((c) => c.id === overId);
          if (targetIndex === -1) targetIndex = targetParent.children.length;
        }
      }

      // 2. Remove from source (only after validation passes)
      newBlocks = removeBlockFromTree(newBlocks, activeId);

      // 3. Add to target
      newBlocks = addBlockToContainer(newBlocks, draggedBlock, targetContainerId, targetIndex);
    }

    const newConfig = { ...config, blocks: newBlocks };
    setConfig(newConfig);

    // Send updated config to parent
    window.parent.postMessage(
      { type: 'config-updated', config: newConfig } satisfies ConfigUpdatedMessage,
      '*',
    );
  }, [config]);

  if (!config || !context) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-8" />
      </div>
    );
  }

  const enabledBlocks = config.blocks.filter((b) => b.enabled);
  const layout = getLayout(config);

  return (
    <div
      className="min-h-screen bg-background"
      style={buildThemeCssVars(config.theme.primary, config.theme.background)}
      onClick={handleCanvasClick}
    >
      <div
        className={cn(
          'flex flex-col',
          gapClass[layout.gap],
          paddingClass[layout.padding],
          alignItemsClass[layout.align],
          maxWidthClass[layout.maxWidth],
          layout.maxWidth !== 'none' && 'mx-auto',
        )}
      >
        {enabledBlocks.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No blocks yet. Use &quot;Add Block&quot; to get started.
            </p>
          </div>
        ) : (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={enabledBlocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {enabledBlocks.map((block) => {
                const isLayout = getBlockDef(block.type)?.acceptsChildren === true;
                // Check if this layout is the active drop container
                const isActiveContainer = !!(isLayout && activeId && overContainerId === block.id);
                // Check if this block is being hovered (for drop line indicator)
                const isOver = overId === block.id && overContainerId === 'root';
                // Get which child is being hovered for this layout
                const overChildId = isLayout && overContainerId === block.id ? overId : null;

                return (
                  <SortableBlock
                    key={block.id}
                    block={block}
                    context={context}
                    isSelected={selectedBlockId === block.id}
                    onSelect={handleSelectBlock}
                    selectedBlockId={selectedBlockId}
                    containerId="root"
                    isOver={isOver}
                    isActiveContainer={isActiveContainer}
                    overChildId={overChildId}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

// ─── Live Mode Component ───────────────────────────────────────────────────────

function LiveModePreview() {
  const { id } = useParams<{ id: string }>();
  const { data: slideshowData, isLoading, error } = usePublicSlideshow(id);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (error || !slideshowData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="size-4" />
          <AlertDescription>Failed to load slideshow. Please try again.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Use fetched config or fall back to default
  const config: SlideshowConfig =
    slideshowData.config && (slideshowData.config as SlideshowConfig).blocks?.length > 0
      ? (slideshowData.config as SlideshowConfig)
      : DEFAULT_CONFIG;

  const context: SlideshowContext = {
    event: {
      id: id!,
      name: slideshowData.event.name,
      subtitle: slideshowData.event.subtitle ?? null,
      logoUrl: slideshowData.event.logoUrl ?? null,
    },
    stats: {
      photoCount: slideshowData.stats.photoCount,
      searchCount: slideshowData.stats.searchCount,
      downloadCount: 0,
    },
    photos: [],
    liveMode: true,
  };

  const enabledBlocks = config.blocks.filter((b) => b.enabled);
  const layout = getLayout(config);

  return (
    <div
      className="min-h-screen bg-background"
      style={buildThemeCssVars(config.theme.primary, config.theme.background)}
    >
      <div
        className={cn(
          'flex flex-col',
          gapClass[layout.gap],
          paddingClass[layout.padding],
          alignItemsClass[layout.align],
          maxWidthClass[layout.maxWidth],
          layout.maxWidth !== 'none' && 'mx-auto',
        )}
      >
        {enabledBlocks.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">No blocks configured.</p>
          </div>
        ) : (
          enabledBlocks.map((block) => <BlockRenderer key={block.id} block={block} context={context} />)
        )}
      </div>
    </div>
  );
}

// ─── Block Renderer (for live mode - no drag) ──────────────────────────────────

function BlockRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const def = getBlockDef(block.type);
  if (!def) return null;
  return (
    <div className="w-full">
      <def.Renderer block={block} context={context} />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function SlideshowPreviewPage() {
  const [searchParams] = useSearchParams();
  const isEditorMode = searchParams.get('mode') === 'editor';

  if (isEditorMode) {
    return <EditorModePreview />;
  }

  return <LiveModePreview />;
}
