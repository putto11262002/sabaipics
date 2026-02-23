import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type RedemptionsResponse = InferResponseType<
  (typeof api.admin)['gift-codes'][':id']['redemptions']['$get'],
  SuccessStatusCode
>;

export type RedemptionItem = RedemptionsResponse['data'][number];

export type UseGiftCodeRedemptionsParams = {
  id: string;
  cursor?: string;
  limit?: number;
};

export function useGiftCodeRedemptions(params: UseGiftCodeRedemptionsParams) {
  return useAdminQuery<RedemptionsResponse>({
    queryKey: ['admin', 'gift-codes', 'detail', params.id, 'redemptions', { cursor: params.cursor }],
    apiFn: (opts) =>
      api.admin['gift-codes'][':id'].redemptions.$get(
        {
          param: { id: params.id },
          query: {
            cursor: params.cursor,
            limit: params.limit,
          },
        },
        opts,
      ),
    enabled: !!params.id,
  });
}
