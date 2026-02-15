import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

type ColorGradeResponse = InferResponseType<
  typeof api.events[':id']['color-grade']['$get'],
  SuccessStatusCode
>;

export type EventColorGrade = ColorGradeResponse['data'];

export function useEventColorGrade(eventId: string | undefined) {
  return useApiQuery<ColorGradeResponse>({
    queryKey: ['events', 'detail', eventId, 'color-grade'],
    apiFn: (opts) => api.events[':id']['color-grade'].$get({ param: { id: eventId! } }, opts),
    enabled: !!eventId,
    staleTime: 0,
  });
}
