import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiInfiniteQuery } from '@/shared/hooks/rq/use-api-infinite-query';

const listPhotos = api.events[':eventId'].photos.$post;

type PhotosResponse = InferResponseType<typeof listPhotos, SuccessStatusCode>;

export type Photo = PhotosResponse['data'][0];
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
  return useApiInfiniteQuery<PhotosResponse, string | undefined>({
    queryKey: ['event', eventId, 'photos', status],
    apiFn: (pageParam, opts) =>
      listPhotos(
        {
          param: { eventId: eventId! },
          json: {
            ...(pageParam ? { cursor: pageParam } : {}),
            ...(status ? { status } : {}),
          },
        },
        opts,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.hasMore
        ? (lastPage.pagination.nextCursor ?? undefined)
        : undefined;
    },
    enabled: !!eventId,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  });
}
