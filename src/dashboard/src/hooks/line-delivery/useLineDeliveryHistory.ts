import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const getHistory = api['line-delivery'].history.$get;
type HistoryResponse = InferResponseType<typeof getHistory, SuccessStatusCode>;

export type LineDeliveryHistoryData = HistoryResponse['data'];

export function useLineDeliveryHistory(page: number = 0, limit: number = 20) {
  return useApiQuery<HistoryResponse>({
    queryKey: ['line-delivery', 'history', page, limit],
    apiFn: (opts) =>
      getHistory(
        { query: { page, limit } },
        opts,
      ),
    staleTime: 1000 * 30,
  });
}
