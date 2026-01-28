import { cn } from '@sabaipics/uiv3/lib/utils';
import type { SlideshowBlock, SlideshowContext, GalleryProps } from '../../types';

const COL_CLASS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

export function GalleryRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as GalleryProps;
  const columns = props.columns || 3;
  const gap = props.gap ?? 8;

  const hasPhotos = context.photos.length > 0;

  if (hasPhotos) {
    return (
      <div className={cn('grid', COL_CLASS[columns] ?? 'grid-cols-3')} style={{ gap: `${gap}px` }}>
        {context.photos.map((photo) => (
          <img
            key={photo.id}
            src={photo.previewUrl}
            alt=""
            className="aspect-square rounded-lg object-cover"
          />
        ))}
      </div>
    );
  }

  // Placeholder grid when no photos are uploaded
  const count = columns * 2;
  return (
    <div className={cn('grid', COL_CLASS[columns] ?? 'grid-cols-3')} style={{ gap: `${gap}px` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-square rounded-lg bg-muted" />
      ))}
    </div>
  );
}
