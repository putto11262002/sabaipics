import { useParams, useSearchParams } from 'react-router';
import { useState, useEffect, useCallback, useId } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Spinner } from '@sabaipics/uiv3/components/spinner';
import { Alert, AlertDescription } from '@sabaipics/uiv3/components/alert';
import { AlertCircle } from 'lucide-react';
import { cn } from '@sabaipics/uiv3/lib/utils';
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
  onReorderChildren?: (parentId: string, newChildren: SlideshowBlock[]) => void;
  selectedBlockId: string | null;
}

function SortableBlock({
  block,
  context,
  isSelected,
  onSelect,
  onReorderChildren,
  selectedBlockId,
}: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
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
        highlighted
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
          onReorderChildren={onReorderChildren}
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
  onReorderChildren?: (parentId: string, newChildren: SlideshowBlock[]) => void;
}

function LayoutBlockContent({
  block,
  context,
  selectedBlockId,
  onSelect,
  onReorderChildren,
}: LayoutBlockContentProps) {
  const dndId = useId();
  const props = block.props as FlexProps;
  const children = block.children ?? [];
  const enabledChildren = children.filter((c) => c.enabled);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = children.findIndex((c) => c.id === active.id);
    const newIndex = children.findIndex((c) => c.id === over.id);
    onReorderChildren?.(block.id, arrayMove(children, oldIndex, newIndex));
  };

  return (
    <div
      className={cn(
        'flex',
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
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
    >
      <DndContext
        id={`${dndId}-children-${block.id}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={enabledChildren.map((c) => c.id)}
          strategy={props.direction === 'row' ? undefined : verticalListSortingStrategy}
        >
          {enabledChildren.map((child) => (
            <SortableChildBlock
              key={child.id}
              block={child}
              context={context}
              isSelected={selectedBlockId === child.id}
              onSelect={onSelect}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ─── Sortable Child Block ───────────────────────────────────────────────────────

interface SortableChildBlockProps {
  block: SlideshowBlock;
  context: SlideshowContext;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function SortableChildBlock({ block, context, isSelected, onSelect }: SortableChildBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
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
      <def.Renderer block={block} context={context} />
    </div>
  );
}

// ─── Editor Mode Component ─────────────────────────────────────────────────────

function EditorModePreview() {
  const dndId = useId();
  const [config, setConfig] = useState<SlideshowConfig | null>(null);
  const [context, setContext] = useState<SlideshowContext | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

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

  // Handle top-level block reordering
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !config) return;

    const oldIndex = config.blocks.findIndex((b) => b.id === active.id);
    const newIndex = config.blocks.findIndex((b) => b.id === over.id);
    const newBlocks = arrayMove(config.blocks, oldIndex, newIndex);

    const newConfig = { ...config, blocks: newBlocks };
    setConfig(newConfig);

    // Send updated config to parent
    window.parent.postMessage(
      { type: 'config-updated', config: newConfig } satisfies ConfigUpdatedMessage,
      '*',
    );
  }, [config]);

  // Handle child block reordering within a layout block
  const handleReorderChildren = useCallback((parentId: string, newChildren: SlideshowBlock[]) => {
    if (!config) return;

    const newBlocks = config.blocks.map((b) =>
      b.id === parentId ? { ...b, children: newChildren } : b,
    );
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
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={enabledBlocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {enabledBlocks.map((block) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  context={context}
                  isSelected={selectedBlockId === block.id}
                  onSelect={handleSelectBlock}
                  onReorderChildren={handleReorderChildren}
                  selectedBlockId={selectedBlockId}
                />
              ))}
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
