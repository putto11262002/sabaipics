import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const getUsageChart = api['credit-packages']['usage-chart'].$get;
type UsageChartApiResponse = InferResponseType<typeof getUsageChart, SuccessStatusCode>;

export interface UsageChartEntry {
  date: string;
  credits: number;
}

export function useUsageChart(days: number = 30) {
  const query = useApiQuery<UsageChartApiResponse>({
    queryKey: ['credit-usage-chart', days],
    apiFn: (opts) =>
      getUsageChart({ query: { days } }, opts),
    staleTime: 1000 * 60,
  });

  return {
    ...query,
    data: query.data?.data,
  };
}
