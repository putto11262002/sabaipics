import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';
import type { InferResponseType } from 'hono/client';

const getSlideshow = api.participant.events[':eventId'].slideshow.$get;

type SlideshowResponse = InferResponseType<typeof getSlideshow, 200>;
export type PublicSlideshowData = SlideshowResponse['data'];

const POLL_INTERVAL = 30_000; // 30 seconds for config/stats (less frequent than photos)

/**
 * Hook to fetch slideshow data (event info, config, stats) from the public participant API.
 * Polls every 30 seconds for updated stats.
 */
export function usePublicSlideshow(eventId: string | undefined) {
  return useQuery({
    queryKey: ['slideshow', eventId, 'config'],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID is required');
      }

      const res = await getSlideshow({
        param: { eventId },
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Event not found');
        }
        throw new Error(`Failed to fetch slideshow: ${res.status}`);
      }

      const json = (await res.json()) as SlideshowResponse;
      return json.data;
    },
    enabled: !!eventId,
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: true,
    staleTime: POLL_INTERVAL - 1000,
  });
}
