import { useQuery } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import { api, useApiClient, withAuth } from '../../lib/api';

const getColorGrade = api.events[':id']['color-grade'].$get;

export type EventColorGrade = InferResponseType<typeof getColorGrade, 200>['data'];

export function useEventColorGrade(eventId: string | undefined) {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['event', eventId, 'color-grade'],
    queryFn: async () => {
      if (!eventId) throw new Error('Event ID is required');

      const res = await getColorGrade({ param: { id: eventId } }, await withAuth(getToken));
      if (!res.ok) {
        throw new Error('Failed to load color grade settings');
      }

      const json = await res.json();
      return json.data;
    },
    enabled: !!eventId,
    staleTime: 0,
  });
}
