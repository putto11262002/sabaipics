import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { type InferResponseType } from 'hono/client';

const getEvent = api.events[':id'].$get;

export type Event = InferResponseType<typeof getEvent, 200>['data'];

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      if (!id) {
        throw new Error('Event ID is required');
      }

      const res = await getEvent(
        {
          param: { id },
        },
        {
          init: {
            credentials: 'include',
          },
        },
      );

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Event not found');
        }
        throw new Error(`Failed to fetch event: ${res.status}`);
      }

      return (await res.json()) as InferResponseType<typeof getEvent, 200>;
    },
    enabled: !!id,
    refetchOnWindowFocus: !import.meta.env.DEV,
    refetchOnMount: false,
    staleTime: 1000 * 60, // 1 minute
  });
}
