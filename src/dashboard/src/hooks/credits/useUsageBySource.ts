import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const getUsageBySource = api['credit-packages']['usage']['by-source'].$get;
type UsageBySourceApiResponse = InferResponseType<typeof getUsageBySource, SuccessStatusCode>;

export interface UsageBySourceEntry {
  date: string;
  source: string;
  credits: number;
}

export function useUsageBySource(days: number = 30) {
  const query = useApiQuery<UsageBySourceApiResponse>({
    queryKey: ['credit-usage-by-source', days],
    apiFn: (opts) => getUsageBySource({ query: { days } }, opts),
    staleTime: 1000 * 60,
  });

  return {
    ...query,
    data: query.data?.data,
  };
}
