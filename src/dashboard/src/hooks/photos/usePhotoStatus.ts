import { api } from '../../lib/api';
import type { InferResponseType } from 'hono';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const getStatus = api.photos.status.$get;

type PhotoStatusResponse = InferResponseType<typeof getStatus, 200>;

export type PhotoStatus = PhotoStatusResponse['data'][0];

/**
 * Batch fetch photo statuses by multiple IDs
 */
export function usePhotosStatus(
  photoIds: string[],
  options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
  },
) {
  const query = useApiQuery<PhotoStatusResponse>({
    queryKey: ['photos', 'status', photoIds],
    apiFn: (opts) => getStatus({ query: { ids: photoIds.join(',') } }, opts),
    enabled: options?.enabled !== false && photoIds.length > 0,
    refetchInterval: options?.refetchInterval,
    staleTime: 0,
  });

  return { ...query, data: query.data?.data };
}
