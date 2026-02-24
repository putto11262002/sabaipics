import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const getStats = api['line-delivery'].stats.$get;
type StatsResponse = InferResponseType<typeof getStats, SuccessStatusCode>;

export type LineDeliveryStatsData = StatsResponse['data'];

export function useLineDeliveryStats() {
  return useApiQuery<StatsResponse>({
    queryKey: ['line-delivery', 'stats'],
    apiFn: (opts) => getStats({}, opts),
    staleTime: 1000 * 30,
  });
}
