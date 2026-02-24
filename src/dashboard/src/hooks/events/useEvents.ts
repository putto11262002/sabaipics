import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

type EventsResponse = InferResponseType<typeof api.events.$get, SuccessStatusCode>;

export type Event = EventsResponse['data'][number];

export function useEvents(page: number = 0, limit: number = 20) {
  return useApiQuery<EventsResponse>({
    queryKey: ['events', 'list', { page, limit }],
    apiFn: (opts) => api.events.$get({ query: { page, limit } }, opts),
    staleTime: 1000 * 30, // 30 seconds
  });
}
