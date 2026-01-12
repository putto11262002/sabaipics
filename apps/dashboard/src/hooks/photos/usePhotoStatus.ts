import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api';

export interface PhotoStatus {
  id: string;
  status: 'uploading' | 'indexing' | 'indexed' | 'failed';
  errorName: string | null;
  faceCount: number;
  fileSize: number | null;
  thumbnailUrl: string;
  uploadedAt: string;
}

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
  const { createAuthClient } = useApiClient();

  return useQuery({
    queryKey: ['photos', 'status', photoIds],
    queryFn: async (): Promise<PhotoStatus[]> => {
      if (photoIds.length === 0) return [];

      const client = await createAuthClient();
      const response = await client.photos.status.$get({
        query: { ids: photoIds.join(',') },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch photo statuses');
      }

      const json = await response.json();
      return json.data as PhotoStatus[];
    },
    enabled: options?.enabled !== false && photoIds.length > 0,
    refetchInterval: options?.refetchInterval,
    staleTime: 0,
  });
}
