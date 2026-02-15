import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

type EventResponse = InferResponseType<typeof api.events[':id']['$get'], SuccessStatusCode>;

export type Event = EventResponse['data'];

export function useEvent(id: string | undefined) {
  return useApiQuery<EventResponse>({
    queryKey: ['events', 'detail', id],
    apiFn: (opts) => api.events[':id'].$get({ param: { id: id! } }, opts),
    enabled: !!id,
    refetchOnWindowFocus: !import.meta.env.DEV,
    refetchOnMount: false,
    staleTime: 1000 * 60, // 1 minute
  });
}
