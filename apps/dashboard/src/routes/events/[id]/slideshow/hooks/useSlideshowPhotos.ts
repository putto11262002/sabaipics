import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';
import type { InferResponseType } from 'hono/client';

const getPhotos = api.participant.events[':eventId'].photos.$get;

type PhotosResponse = InferResponseType<typeof getPhotos, 200>;
export type SlideshowPhoto = PhotosResponse['data'][number];

const POLL_INTERVAL = 10_000; // 10 seconds

/**
 * Hook to fetch slideshow photos from the public participant API.
 * Polls every 10 seconds for fresh photos.
 */
export function useSlideshowPhotos(eventId: string | undefined, limit: number) {
  return useQuery({
    queryKey: ['slideshow', eventId, 'photos', limit],
    queryFn: async () => {
      if (!eventId || limit === 0) {
        return { data: [], pagination: { nextCursor: null, hasMore: false } };
      }

      const res = await getPhotos({
        param: { eventId },
        query: { limit },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch slideshow photos: ${res.status}`);
      }

      return (await res.json()) as PhotosResponse;
    },
    enabled: !!eventId && limit > 0,
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: true,
    staleTime: POLL_INTERVAL - 1000, // Consider stale just before next poll
  });
}
