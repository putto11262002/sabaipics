import { useParams, useSearchParams } from 'react-router';
import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Spinner } from '@sabaipics/uiv3/components/spinner';
import { Alert, AlertDescription } from '@sabaipics/uiv3/components/alert';
import { AlertCircle } from 'lucide-react';
import { cn } from '@sabaipics/uiv3/lib/utils';
import type { SlideshowConfig, SlideshowContext, SlideshowBlock } from './types';
import { DEFAULT_CONFIG } from './lib/templates';
import { buildThemeCssVars } from './lib/color-utils';
import { getBlockDef } from './blocks/registry';
import { usePublicSlideshow } from './hooks/usePublicSlideshow';

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

// ─── Editor Mode Component ─────────────────────────────────────────────────────

function EditorModePreview() {
  const [config, setConfig] = useState<SlideshowConfig | null>(null);
  const [context, setContext] = useState<SlideshowContext | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Listen for config from parent editor
  useEffect(() => {
    const handler = (event: MessageEvent<EditorConfigMessage>) => {
      if (event.data.type === 'slideshow-config') {
        console.log('[IFRAME] Received slideshow-config', {
          blockCount: event.data.config.blocks.length,
          selectedBlockId: event.data.selectedBlockId,
        });
        setConfig(event.data.config);
        setContext(event.data.context);
        setSelectedBlockId(event.data.selectedBlockId);
      }
    };
    window.addEventListener('message', handler);

    // Signal to parent that iframe is ready
    console.log('[IFRAME] Sending iframe-ready');
    window.parent.postMessage({ type: 'iframe-ready' }, '*');

    return () => window.removeEventListener('message', handler);
  }, []);

  // Notify parent when a block is clicked
  const handleBlockClick = useCallback((blockId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.parent.postMessage({ type: 'block-selected', blockId } satisfies BlockSelectedMessage, '*');
  }, []);

  // Deselect when clicking canvas background
  const handleCanvasClick = useCallback(() => {
    window.parent.postMessage({ type: 'block-selected', blockId: '' } satisfies BlockSelectedMessage, '*');
  }, []);

  // Handle drag start
  const handleDragStart = useCallback((blockId: string) => {
    setDraggedBlockId(blockId);
  }, []);

  // Handle drag - update position immediately during drag
  const handleDrag = useCallback((blockId: string, position: { x: number; y: number }) => {
    setConfig((prevConfig) => {
      if (!prevConfig) return prevConfig;

      // Update position immediately during drag (no rubber band effect)
      return {
        ...prevConfig,
        blocks: prevConfig.blocks.map((b) =>
          b.id === blockId ? { ...b, position } : b
        ),
      };
    });
  }, []); // Empty deps - uses functional update to avoid stale closure

  // Handle drag end - send final config to parent
  const handleDragEnd = useCallback((blockId: string) => {
    console.log('[IFRAME] Drag ended for block:', blockId);
    setDraggedBlockId(null);

    setConfig((currentConfig) => {
      if (!currentConfig) return currentConfig;

      const block = currentConfig.blocks.find((b) => b.id === blockId);
      if (!block) return currentConfig;

      console.log('[IFRAME] Sending config-updated', {
        blockId,
        finalPosition: block.position,
      });

      // Send updated config to parent
      window.parent.postMessage(
        { type: 'config-updated', config: currentConfig } satisfies ConfigUpdatedMessage,
        '*'
      );

      return currentConfig; // No state change, just send message
    });
  }, []); // Empty deps - uses functional update to access latest config

  if (!config || !context) {
    return (
      <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <PreviewContent
      config={config}
      context={context}
      selectedBlockId={selectedBlockId}
      draggedBlockId={draggedBlockId}
      onBlockClick={handleBlockClick}
      onCanvasClick={handleCanvasClick}
      canvasRef={canvasRef}
      editorMode={true}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
    />
  );
}

// ─── Live Mode Component ───────────────────────────────────────────────────────

function LiveModePreview() {
  const { id } = useParams<{ id: string }>();
  const { data: slideshowData, isLoading, error } = usePublicSlideshow(id);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (error || !slideshowData) {
    return (
      <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background p-8">
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
      downloadCount: 0, // Not available from public endpoint
    },
    photos: [], // Gallery will fetch its own photos in live mode
    liveMode: true,
  };

  return <PreviewContent config={config} context={context} />;
}

// ─── Shared Preview Content ────────────────────────────────────────────────────

interface PreviewContentProps {
  config: SlideshowConfig;
  context: SlideshowContext;
  selectedBlockId?: string | null;
  draggedBlockId?: string | null;
  onBlockClick?: (blockId: string, e: React.MouseEvent) => void;
  onCanvasClick?: () => void;
  canvasRef?: React.RefObject<HTMLDivElement | null>;
  editorMode?: boolean;
  onDragStart?: (blockId: string) => void;
  onDrag?: (blockId: string, position: { x: number; y: number }) => void;
  onDragEnd?: (blockId: string) => void;
}

// Memoized block renderer to prevent unnecessary re-renders
const BlockRenderer = memo(function BlockRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const def = getBlockDef(block.type);
  if (!def) return null;
  return <def.Renderer block={block} context={context} />;
});

// Draggable block wrapper component
const DraggableBlock = memo(function DraggableBlock({
  block,
  context,
  isSelected,
  isDragging,
  onBlockClick,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
  isSelected: boolean;
  isDragging: boolean;
  onBlockClick?: (blockId: string, e: React.MouseEvent) => void;
  onDragStart?: (blockId: string) => void;
  onDrag?: (blockId: string, position: { x: number; y: number }) => void;
  onDragEnd?: (blockId: string) => void;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();

    const canvas = e.currentTarget.parentElement?.parentElement; // Get canvas ref
    if (!canvas || !blockRef.current) return;

    blockRef.current.setPointerCapture(e.pointerId);
    onDragStart?.(block.id);

    const canvasRect = canvas.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosition = block.position ?? { x: 50, y: 50 };

    const handlePointerMove = (e: PointerEvent) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      // Convert pixel delta to percentage
      const newX = Math.max(0, Math.min(100, startPosition.x + (deltaX / canvasRect.width * 100)));
      const newY = Math.max(0, Math.min(100, startPosition.y + (deltaY / canvasRect.height * 100)));

      onDrag?.(block.id, { x: newX, y: newY });
    };

    const handlePointerUp = () => {
      if (blockRef.current) {
        blockRef.current.releasePointerCapture(e.pointerId);
      }
      onDragEnd?.(block.id);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, [block.id, block.position, onDragStart, onDrag, onDragEnd]);

  const def = getBlockDef(block.type);
  if (!def) return null;

  const position = block.position ?? { x: 50, y: 50 };
  const size = block.size ?? def.defaultSize;

  const style: React.CSSProperties = {
    left: `${position.x}%`,
    top: `${position.y}%`,
    transform: 'translate(-50%, -50%)',
    width: size ? `${size.width}vw` : undefined,
    height: size ? `${size.height}vh` : undefined,
    zIndex: block.type === 'gallery' ? 0 : 1,
  };

  return (
    <div
      ref={blockRef}
      className={cn(
        'absolute transition-all',
        'cursor-move touch-none', // Prevent text selection during drag
        isHovering && !isDragging && 'outline outline-2 outline-blue-400',
        isSelected && 'ring-2 ring-primary ring-offset-2',
        isDragging && 'opacity-50',
      )}
      style={style}
      onClick={onBlockClick ? (e) => onBlockClick(block.id, e as any) : undefined}
      onPointerDown={handlePointerDown}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <BlockRenderer block={block} context={context} />
    </div>
  );
});

function PreviewContent({
  config,
  context,
  selectedBlockId,
  draggedBlockId,
  onBlockClick,
  onCanvasClick,
  canvasRef,
  editorMode = false,
  onDragStart,
  onDrag,
  onDragEnd,
}: PreviewContentProps) {
  // Filter to only enabled top-level blocks
  const enabledBlocks = config.blocks.filter((block) => block.enabled);

  // Check if a block or any of its children is selected
  const isBlockOrChildSelected = (block: SlideshowBlock): boolean => {
    if (block.id === selectedBlockId) return true;
    if (block.children) {
      return block.children.some((child) => isBlockOrChildSelected(child));
    }
    return false;
  };

  return (
    <div
      ref={canvasRef}
      className="fixed inset-0 overflow-hidden bg-background"
      style={buildThemeCssVars(config.theme.primary, config.theme.background)}
      onClick={onCanvasClick}
    >
      {enabledBlocks.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">No blocks configured.</p>
        </div>
      ) : (
        <div className="relative h-full w-full">
          {enabledBlocks.map((block) => {
            const isSelected = isBlockOrChildSelected(block);
            const isDragging = draggedBlockId === block.id;

            if (editorMode) {
              return (
                <DraggableBlock
                  key={block.id}
                  block={block}
                  context={context}
                  isSelected={isSelected}
                  isDragging={isDragging}
                  onBlockClick={onBlockClick}
                  onDragStart={onDragStart}
                  onDrag={onDrag}
                  onDragEnd={onDragEnd}
                />
              );
            }

            // Live mode (non-draggable)
            const def = getBlockDef(block.type);
            if (!def) return null;
            const position = block.position ?? { x: 50, y: 50 };
            // Use block size if available, otherwise fall back to default size from definition
            const size = block.size ?? def.defaultSize;

            return (
              <div
                key={block.id}
                className={cn(
                  'absolute transition-shadow',
                  onBlockClick && 'cursor-pointer',
                  isSelected && 'ring-2 ring-primary ring-offset-2',
                )}
                style={{
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  transform: 'translate(-50%, -50%)',
                  ...(size && {
                    width: `${size.width}vw`,
                    height: `${size.height}vh`,
                  }),
                  zIndex: block.type === 'gallery' ? 0 : 1, // Gallery always in background
                }}
                onClick={onBlockClick ? (e) => onBlockClick(block.id, e) : undefined}
              >
                <def.Renderer block={block} context={context} />
              </div>
            );
          })}
        </div>
      )}
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
