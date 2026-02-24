import { memo, useMemo } from 'react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { AspectRatio } from '@/shared/components/ui/aspect-ratio';
import type { SlideshowBlock, SlideshowContext, GalleryProps, GalleryDensity } from '../../types';
import { useContainerSize } from '../../hooks/useContainerSize';
import { useSlideshowPhotos } from '../../hooks/useSlideshowPhotos';

// Density presets → minimum cell size in pixels
// CSS Grid auto-fill with minmax will calculate actual column count
const DENSITY_MIN_SIZE: Record<GalleryDensity, number> = {
  sparse: 200, // Larger cells → fewer columns (2-4)
  normal: 150, // Medium cells → moderate columns (3-6)
  dense: 100, // Smaller cells → more columns (5-8+)
};

export const GalleryRenderer = memo(function GalleryRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as GalleryProps;
  const density = props.density ?? 'normal';
  const gap = props.gap ?? 8;
  const rows = props.rows ?? 3;

  const { ref, size } = useContainerSize<HTMLDivElement>();
  const minSize = DENSITY_MIN_SIZE[density];

  // Estimate column count for photo fetching (CSS Grid handles actual layout)
  const estimatedCols = useMemo(() => {
    if (size.width <= 0) return 4; // Default estimate
    return Math.max(1, Math.floor((size.width + gap) / (minSize + gap)));
  }, [size.width, minSize, gap]);

  const photoCount = estimatedCols * rows;

  // In live mode, fetch photos from public API
  const { data: photosData } = useSlideshowPhotos(
    context.liveMode ? context.event.id : undefined,
    photoCount,
  );

  // Use fetched photos in live mode, otherwise use context.photos (editor mode)
  const photos = context.liveMode ? (photosData?.data ?? []) : context.photos;

  // Generate slots (photos + skeleton placeholders)
  const slots = useMemo(() => {
    return Array.from({ length: photoCount }, (_, i) => {
      const photo = photos[i];
      return (
        <AspectRatio key={photo?.id ?? `slot-${i}`} ratio={1}>
          {photo ? (
            <img src={photo.previewUrl} alt="" className="h-full w-full rounded-lg object-cover" />
          ) : (
            <Skeleton className="h-full w-full rounded-lg" />
          )}
        </AspectRatio>
      );
    });
  }, [photoCount, photos]);

  // Don't render until we have width measurement
  if (size.width <= 0) {
    return <div ref={ref} className="w-full" />;
  }

  return (
    <div ref={ref} className="w-full">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${minSize}px, 1fr))`,
          gap: `${gap}px`,
        }}
      >
        {slots}
      </div>
    </div>
  );
});
