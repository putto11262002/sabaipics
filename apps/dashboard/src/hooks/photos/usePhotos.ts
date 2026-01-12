import { useInfiniteQuery } from '@tanstack/react-query';
import { api, useApiClient } from '../../lib/api';
import { type InferResponseType } from 'hono/client';

const getPhoto = api.events[':eventId'].photos.$get;

export type Photo = InferResponseType<typeof getPhoto, 200>['data'][0];

export function usePhotos({ eventId }: { eventId: string | undefined }) {
  const { api } = useApiClient();

  return useInfiniteQuery({
    queryKey: ['event', eventId, 'photos'],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      if (!eventId) {
        throw new Error('eventId is required');
      }

      const res = await api.events[':eventId'].photos.$get(
        {
          param: { eventId },
          query: pageParam ? { cursor: pageParam } : {},
        },
        {
          init: {
            credentials: 'include',
          },
        },
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch photos: ${res.status}`);
      }

      return (await res.json()) as InferResponseType<typeof getPhoto, 200>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.hasMore
        ? (lastPage.pagination.nextCursor ?? undefined)
        : undefined;
    },
    enabled: !!eventId,
    refetchOnWindowFocus: !import.meta.env.DEV, // Disable refetch on window focus in dev
    refetchOnMount: false, // Don't refetch on mount if data exists
    refetchInterval: 1000 * 60, // 1 min
  });
}
