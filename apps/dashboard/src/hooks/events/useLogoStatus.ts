import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useLogoStatus({
  eventId,
  uploadId,
}: {
  eventId: string;
  uploadId: string | null;
}) {
  return useQuery({
    queryKey: ['logo', 'status', eventId, uploadId],
    queryFn: async () => {
      if (!uploadId) {
        return null;
      }

      const response = await api.events[':id'].logo.status.$get({
        param: { id: eventId },
        query: { id: uploadId },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch logo status');
      }

      const json = await response.json();
      return {
        status: json.data.status,
        logoUrl: json.data.logoUrl,
        errorMessage: json.data.errorMessage,
      };
    },
    enabled: !!uploadId,
    refetchInterval: 2000, // Poll every 2 seconds
    staleTime: 0,
  });
}
