import { useParams } from 'react-router';
import { Spinner } from '@sabaipics/uiv3/components/spinner';
import { Alert, AlertDescription } from '@sabaipics/uiv3/components/alert';
import { AlertCircle } from 'lucide-react';
import type { SlideshowConfig, SlideshowContext } from './types';
import { DEFAULT_CONFIG } from './lib/templates';
import { buildThemeCssVars } from './lib/color-utils';
import { getBlockDef } from './blocks/registry';
import { usePublicSlideshow } from './hooks/usePublicSlideshow';

export default function SlideshowPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: slideshowData, isLoading, error } = usePublicSlideshow(id);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-background">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (error || !slideshowData) {
    return (
      <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-background p-8">
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

  // Filter to only enabled top-level blocks
  const enabledBlocks = config.blocks.filter((block) => block.enabled);

  // Block types that should expand to fill available space
  const expandableTypes = new Set(['gallery']);

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-background"
      style={buildThemeCssVars(config.theme.primary, config.theme.background)}
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

          if (shouldExpand) {
            // Expandable blocks (gallery, flex) - grow to fill remaining space
            return (
              <div key={block.id} className="flex min-h-0 flex-1 flex-col">
                <def.Renderer block={block} context={context} />
              </div>
            );
          }

          // Non-expandable blocks - fixed size, no grow/shrink
          return (
            <div key={block.id} className="flex-none">
              <def.Renderer block={block} context={context} />
            </div>
          );
        })
      )}
    </div>
  );
}
