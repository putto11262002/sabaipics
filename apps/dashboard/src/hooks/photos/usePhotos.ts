import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { type InferResponseType } from 'hono/client';

const listPhotos = api.events[':eventId'].photos.$post;

export type Photo = InferResponseType<typeof listPhotos, 200>['data'][0];
export type PhotoStatus = Photo['status'];

export function usePhotos({
  eventId,
  status,
}: {
  eventId: string | undefined;
  status?: PhotoStatus[];
}) {
  return useInfiniteQuery({
    queryKey: ['event', eventId, 'photos', status],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      if (!eventId) {
        throw new Error('eventId is required');
      }

      const res = await listPhotos(
        {
          param: { eventId },
          json: {
            ...(pageParam ? { cursor: pageParam } : {}),
            ...(status ? { status } : {}),
          },
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

      return (await res.json()) as InferResponseType<typeof listPhotos, 200>;
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
