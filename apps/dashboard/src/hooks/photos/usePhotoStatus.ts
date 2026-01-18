import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { InferResponseType } from 'hono';

const getStatus = api.photos.status.$get;

export type PhotoStatus = InferResponseType<typeof getStatus, 200>['data'][0];

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
  return useQuery({
    queryKey: ['photos', 'status', photoIds],
    queryFn: async (): Promise<PhotoStatus[]> => {
      if (photoIds.length === 0) return [];

      const response = await getStatus({
        query: { ids: photoIds.join(',') },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch photo statuses');
      }

      const json = await response.json();
      return json.data;
    },
    enabled: options?.enabled !== false && photoIds.length > 0,
    refetchInterval: options?.refetchInterval,
    staleTime: 0,
  });
}
