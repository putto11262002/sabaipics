import { Skeleton } from '@sabaipics/uiv3/components/skeleton';
import type { SlideshowBlock, SlideshowContext, GalleryProps, GalleryDensity } from '../../types';
import { useContainerSize } from '../../hooks/useContainerSize';
import { useSlideshowPhotos } from '../../hooks/useSlideshowPhotos';

// Density presets: [minRatio, maxRatio] → controls column count
const DENSITY_RATIOS: Record<GalleryDensity, [number, number]> = {
  sparse: [0.25, 0.35], // 3-4 columns
  normal: [0.16, 0.25], // 4-6 columns
  dense: [0.12, 0.16],  // 6-8 columns
};

export function GalleryRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as GalleryProps;
  const density = props.density ?? 'normal';
  const gap = props.gap ?? 8;

  const { ref, size } = useContainerSize<HTMLDivElement>();
  const { width, height } = size;

  // Get ratios based on density setting
  const [minRatio, maxRatio] = DENSITY_RATIOS[density];
  const minCellSize = width * minRatio;
  const maxCellSize = width * maxRatio;

  // Calculate grid dimensions
  let cols = 0;
  let cellSize = minCellSize;

  if (width > 0) {
    // Calculate columns based on min cell size
    cols = Math.max(1, Math.floor((width + gap) / (minCellSize + gap)));
    cellSize = (width - (cols - 1) * gap) / cols;

    // If cells are too large, add more columns
    while (cellSize > maxCellSize && cols < 20) {
      cols++;
      cellSize = (width - (cols - 1) * gap) / cols;
    }
  }

  const rows = height > 0 ? Math.max(1, Math.floor((height + gap) / (cellSize + gap))) : 0;
  const count = cols * rows;

  // In live mode, fetch photos from public API
  const { data: photosData } = useSlideshowPhotos(
    context.liveMode ? context.event.id : undefined,
    count,
  );

  // Use fetched photos in live mode, otherwise use context.photos (editor pre-fetched)
  const photos = context.liveMode ? (photosData?.data ?? []) : context.photos;

  // Grid style
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
    gap: `${gap}px`,
  };

  // Still measuring - show nothing
  if (count === 0) {
    return <div ref={ref} className="h-full w-full flex-1" />;
  }

  // Build slots
  const slots = Array.from({ length: count }, (_, i) => {
    const photo = photos[i];
    if (photo) {
      return (
        <img
          key={photo.id}
          src={photo.previewUrl}
          alt=""
          className="rounded-lg object-cover"
          style={{ width: cellSize, height: cellSize }}
        />
      );
    }
    // Fill with skeleton
    return (
      <Skeleton
        key={`slot-${i}`}
        className="rounded-lg"
        style={{ width: cellSize, height: cellSize }}
      />
    );
  });

  return (
    <div ref={ref} className="h-full w-full flex-1">
      <div style={gridStyle}>{slots}</div>
    </div>
  );
}
