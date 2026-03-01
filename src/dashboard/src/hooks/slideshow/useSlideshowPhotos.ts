import { useMemo } from 'react';
import { usePhotos } from '../photos/usePhotos';
import type { SlideshowPhoto } from '@/shared/slideshow';

const BUFFER_SIZE = 10;

/**
 * Returns the latest photos for slideshow display.
 * Simple implementation - just takes the first BUFFER_SIZE photos from the API.
 */
export function useSlideshowPhotos(eventId: string | undefined): SlideshowPhoto[] {
  // Fetch photos with polling
  const { data } = usePhotos({ eventId, status: ['indexed'] });

  // Flatten pages and get all photos - memoize to prevent unnecessary re-renders
  const photos = useMemo(() => {
    const allPhotos = data?.pages?.flatMap((page) => page.data) ?? [];

    // Take the first BUFFER_SIZE photos and convert to SlideshowPhoto format
    return allPhotos.slice(0, BUFFER_SIZE).map((photo) => ({
      id: photo.id,
      r2Key: photo.previewUrl,
      width: photo.width,
      height: photo.height,
      createdAt: photo.uploadedAt,
    }));
  }, [data?.pages]);

  return photos;
}
