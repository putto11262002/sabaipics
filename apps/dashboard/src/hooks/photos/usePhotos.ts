import { useInfiniteQuery } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';
import { type InferResponseType } from 'hono/client';

const listPhotos = api.events[':eventId'].photos.$post;

export type Photo = InferResponseType<typeof listPhotos, 200>['data'][0];
export type PhotoStatus = Photo['status'];

export type PhotoExif = {
  make?: string;
  model?: string;
  lensModel?: string;
  focalLength?: number;
  iso?: number;
  fNumber?: number;
  exposureTime?: number;
  dateTimeOriginal?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
};

export function usePhotos({
  eventId,
  status,
}: {
  eventId: string | undefined;
  status?: PhotoStatus[];
}) {
  const { getToken } = useApiClient();

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
        await withAuth(getToken),
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
    refetchOnWindowFocus: false,
    refetchOnMount: 'always', // Always refetch on mount to get fresh data
  });
}
