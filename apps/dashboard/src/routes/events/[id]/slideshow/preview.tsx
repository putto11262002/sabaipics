import { useParams, useSearchParams } from 'react-router';
import { useState, useEffect, useCallback } from 'react';
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

// ─── Editor Mode Component ─────────────────────────────────────────────────────

function EditorModePreview() {
  const [config, setConfig] = useState<SlideshowConfig | null>(null);
  const [context, setContext] = useState<SlideshowContext | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

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
  const handleBlockClick = useCallback((blockId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.parent.postMessage({ type: 'block-selected', blockId } satisfies BlockSelectedMessage, '*');
  }, []);

  // Deselect when clicking canvas background
  const handleCanvasClick = useCallback(() => {
    window.parent.postMessage({ type: 'block-selected', blockId: '' } satisfies BlockSelectedMessage, '*');
  }, []);

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
      onBlockClick={handleBlockClick}
      onCanvasClick={handleCanvasClick}
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
  onBlockClick?: (blockId: string, e: React.MouseEvent) => void;
  onCanvasClick?: () => void;
}

function PreviewContent({
  config,
  context,
  selectedBlockId,
  onBlockClick,
  onCanvasClick,
}: PreviewContentProps) {
  // Filter to only enabled top-level blocks
  const enabledBlocks = config.blocks.filter((block) => block.enabled);

  // Block types that should expand to fill available space
  const expandableTypes = new Set(['gallery']);

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
      className="fixed inset-0 flex flex-col overflow-hidden bg-background"
      style={buildThemeCssVars(config.theme.primary, config.theme.background)}
      onClick={onCanvasClick}
    >
      {enabledBlocks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">No blocks configured.</p>
        </div>
      ) : (
        enabledBlocks.map((block) => {
          const def = getBlockDef(block.type);
          if (!def) return null;
          const shouldExpand = expandableTypes.has(block.type);
          const isSelected = isBlockOrChildSelected(block);

          const blockContent = (
            <div
              className={cn(
                'relative transition-shadow',
                shouldExpand && 'h-full', // Expandable blocks need full height
                onBlockClick && 'cursor-pointer',
                isSelected && 'ring-2 ring-primary ring-offset-2',
              )}
              onClick={onBlockClick ? (e) => onBlockClick(block.id, e) : undefined}
            >
              <def.Renderer block={block} context={context} />
            </div>
          );

          if (shouldExpand) {
            // Expandable blocks (gallery, flex) - grow to fill remaining space
            return (
              <div key={block.id} className="flex min-h-0 flex-1 flex-col">
                {blockContent}
              </div>
            );
          }

          // Non-expandable blocks - fixed size, no grow/shrink
          return (
            <div key={block.id} className="flex-none">
              {blockContent}
            </div>
          );
        })
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
