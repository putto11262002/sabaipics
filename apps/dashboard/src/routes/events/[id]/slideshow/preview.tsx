import { useParams, useSearchParams } from 'react-router';
import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Spinner } from '@sabaipics/uiv3/components/spinner';
import { Alert, AlertDescription } from '@sabaipics/uiv3/components/alert';
import { AlertCircle } from 'lucide-react';
import { cn } from '@sabaipics/uiv3/lib/utils';
import type { SlideshowConfig, SlideshowContext, SlideshowBlock, LogoProps } from './types';
import { DEFAULT_CONFIG } from './lib/templates';
import { buildThemeCssVars } from './lib/color-utils';
import { getBlockDef } from './blocks/registry';
import { usePublicSlideshow } from './hooks/usePublicSlideshow';

// ─── Grid Snapping Utilities ──────────────────────────────────────────────────

const GRID_SIZE = 5; // 5vmin intervals
const SNAP_THRESHOLD = 2; // Snap within 2vmin

/**
 * Convert viewport percentage to vmin percentage
 * @param percent - Percentage of viewport dimension (0-100)
 * @param isHorizontal - true for X axis (width), false for Y axis (height)
 * @returns Percentage in vmin units
 */
function percentToVmin(percent: number, isHorizontal: boolean): number {
  // Get viewport dimensions
  if (typeof window === 'undefined') return percent;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vmin = Math.min(vw, vh);

  // Convert percentage to pixels, then to vmin percentage
  const dimension = isHorizontal ? vw : vh;
  const pixels = (percent / 100) * dimension;
  const vminPercent = (pixels / vmin) * 100;

  return vminPercent;
}

/**
 * Convert vmin percentage back to viewport percentage
 * @param vminPercent - Percentage in vmin units
 * @param isHorizontal - true for X axis (width), false for Y axis (height)
 * @returns Percentage of viewport dimension
 */
function vminToPercent(vminPercent: number, isHorizontal: boolean): number {
  if (typeof window === 'undefined') return vminPercent;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vmin = Math.min(vw, vh);

  // Convert vmin percentage to pixels, then to viewport percentage
  const pixels = (vminPercent / 100) * vmin;
  const dimension = isHorizontal ? vw : vh;
  const viewportPercent = (pixels / dimension) * 100;

  return viewportPercent;
}

/**
 * Snaps a value to the nearest grid line if within threshold (using vmin coordinates)
 * @param value - The current position value (percentage)
 * @param isHorizontal - true for X axis (width), false for Y axis (height)
 * @returns Snapped or original value in viewport percentage
 */
function snapToGrid(value: number, isHorizontal: boolean): number {
  // Convert to vmin
  const vminValue = percentToVmin(value, isHorizontal);

  // Snap in vmin space
  const nearest = Math.round(vminValue / GRID_SIZE) * GRID_SIZE;
  const snapped = Math.abs(vminValue - nearest) < SNAP_THRESHOLD ? nearest : vminValue;

  // Convert back to viewport percentage
  return vminToPercent(snapped, isHorizontal);
}

/**
 * Snaps block edges to grid lines, not center point (using vmin coordinates)
 * @param centerX - Current center X position (%)
 * @param centerY - Current center Y position (%)
 * @param blockWidth - Block width (% of viewport)
 * @param blockHeight - Block height (% of viewport)
 * @returns Adjusted center position so edges align with grid
 */
function snapBlockEdgesToGrid(
  centerX: number,
  centerY: number,
  blockWidth: number,
  blockHeight: number,
): { x: number; y: number } {
  // Convert block position and dimensions to vmin coordinates
  const centerXVmin = percentToVmin(centerX, true);
  const centerYVmin = percentToVmin(centerY, false);
  const blockWidthVmin = percentToVmin(blockWidth, true);
  const blockHeightVmin = percentToVmin(blockHeight, false);

  // Calculate edges in vmin
  const leftEdge = centerXVmin - blockWidthVmin / 2;
  const rightEdge = centerXVmin + blockWidthVmin / 2;
  const topEdge = centerYVmin - blockHeightVmin / 2;
  const bottomEdge = centerYVmin + blockHeightVmin / 2;

  // Find closest grid line for each edge (in vmin)
  function findClosestGridSnap(edge: number): number | null {
    const nearest = Math.round(edge / GRID_SIZE) * GRID_SIZE;
    if (Math.abs(edge - nearest) < SNAP_THRESHOLD) {
      return nearest;
    }
    return null;
  }

  // Try to snap each edge
  const leftSnap = findClosestGridSnap(leftEdge);
  const rightSnap = findClosestGridSnap(rightEdge);
  const topSnap = findClosestGridSnap(topEdge);
  const bottomSnap = findClosestGridSnap(bottomEdge);

  // Adjust center to align edges (in vmin)
  let newXVmin = centerXVmin;
  let newYVmin = centerYVmin;

  if (leftSnap !== null) {
    newXVmin = leftSnap + blockWidthVmin / 2;
  } else if (rightSnap !== null) {
    newXVmin = rightSnap - blockWidthVmin / 2;
  }

  if (topSnap !== null) {
    newYVmin = topSnap + blockHeightVmin / 2;
  } else if (bottomSnap !== null) {
    newYVmin = bottomSnap - blockHeightVmin / 2;
  }

  // Convert back to viewport percentages
  const newX = vminToPercent(newXVmin, true);
  const newY = vminToPercent(newYVmin, false);

  return { x: newX, y: newY };
}

// ─── Grid Overlay Component ────────────────────────────────────────────────────

/**
 * Grid overlay component - shows during drag operations
 * Displays grid lines at 5vmin intervals (creates square grid cells)
 */
function GridOverlay({ show }: { show: boolean }) {
  if (!show) return null;

  // Calculate how many grid lines fit based on vmin
  // If viewport is 1920×1080, vmin = 1080 (height is smaller)
  // We want 5vmin intervals, so we need to calculate grid positions

  // Generate grid lines at 5vmin intervals
  // For a portrait screen (height < width), grid will be based on height
  // For a landscape screen (width < height), grid will be based on width

  const gridSize = 5; // 5vmin intervals
  const numLines = Math.floor(100 / gridSize) + 1; // 21 lines (0, 5, 10, ..., 100)

  // Generate positions in vmin units
  const gridPositions = Array.from({ length: numLines }, (_, i) => i * gridSize);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Vertical lines - use vmin for horizontal positioning */}
      {gridPositions.map((pos) => (
        <div
          key={`v-${pos}`}
          className="absolute h-full w-px bg-primary/20"
          style={{ left: `${pos}vmin` }}
        />
      ))}
      {/* Horizontal lines - use vmin for vertical positioning */}
      {gridPositions.map((pos) => (
        <div
          key={`h-${pos}`}
          className="absolute w-full border-t border-primary/20"
          style={{ top: `${pos}vmin` }}
        />
      ))}
    </div>
  );
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

  // Handle drag - update position immediately during drag with grid snapping
  const handleDrag = useCallback((
    blockId: string,
    position: { x: number; y: number },
    dimensions?: { width: number; height: number } // NEW parameter
  ) => {
    setConfig((prevConfig) => {
      if (!prevConfig) return prevConfig;

      // Find the block to get its size
      const block = prevConfig.blocks.find((b) => b.id === blockId);
      if (!block) return prevConfig;

      // Get block dimensions (prioritize measured dimensions from DOM)
      let blockWidth = 0;
      let blockHeight = 0;

      if (dimensions) {
        // Use measured dimensions from DOM (for text blocks)
        blockWidth = dimensions.width;
        blockHeight = dimensions.height;
      } else if (block.type === 'logo') {
        // Logo: extract from props
        const logoProps = block.props as LogoProps;
        blockWidth = logoProps.width;
        blockHeight = logoProps.width; // Square aspect ratio
      } else {
        // Gallery/other blocks: use size property
        const blockDef = getBlockDef(block.type);
        const size = block.size ?? blockDef?.defaultSize;
        if (size) {
          blockWidth = size.width;
          blockHeight = size.height;
        }
      }

      let snappedPosition = position;

      if (blockWidth > 0 && blockHeight > 0) {
        // Block has dimensions - snap edges
        snappedPosition = snapBlockEdgesToGrid(
          position.x,
          position.y,
          blockWidth,
          blockHeight,
        );
      } else {
        // Block sizes to content but dimensions not available - snap center (fallback)
        snappedPosition = {
          x: snapToGrid(position.x, true), // true = horizontal
          y: snapToGrid(position.y, false), // false = vertical
        };
      }

      // Update position immediately during drag
      return {
        ...prevConfig,
        blocks: prevConfig.blocks.map((b) =>
          b.id === blockId ? { ...b, position: snappedPosition } : b
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
      showGrid={draggedBlockId !== null}
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
  onDrag?: (blockId: string, position: { x: number; y: number }, dimensions?: { width: number; height: number }) => void;
  onDragEnd?: (blockId: string) => void;
  showGrid?: boolean;
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
  onDrag?: (blockId: string, position: { x: number; y: number }, dimensions?: { width: number; height: number }) => void;
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
    const blockRect = blockRef.current.getBoundingClientRect(); // NEW: Get block dimensions
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosition = block.position ?? { x: 50, y: 50 };

    // Calculate block dimensions as percentage of canvas
    const blockWidthPercent = (blockRect.width / canvasRect.width) * 100;
    const blockHeightPercent = (blockRect.height / canvasRect.height) * 100;

    const handlePointerMove = (e: PointerEvent) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      // Convert pixel delta to percentage
      const newX = Math.max(0, Math.min(100, startPosition.x + (deltaX / canvasRect.width * 100)));
      const newY = Math.max(0, Math.min(100, startPosition.y + (deltaY / canvasRect.height * 100)));

      // Pass dimensions to onDrag
      onDrag?.(block.id, { x: newX, y: newY }, { width: blockWidthPercent, height: blockHeightPercent });
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
  showGrid = false,
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
      {/* Grid overlay - only visible during drag */}
      <GridOverlay show={showGrid} />

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
