import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type GiftCodesResponse = InferResponseType<
  (typeof api.admin)['gift-codes-v2']['$get'],
  SuccessStatusCode
>;

export type GiftCodeListItem = GiftCodesResponse['data'][number];

export type UseGiftCodesParams = {
  search?: string;
  status?: 'all' | 'active' | 'inactive' | 'expired';
  cursor?: string;
  limit?: number;
};

export function useGiftCodes(params: UseGiftCodesParams = {}) {
  return useAdminQuery<GiftCodesResponse>({
    queryKey: ['admin', 'gift-codes', 'list', params],
    apiFn: (opts) =>
      api.admin['gift-codes-v2'].$get(
        {
          query: {
            search: params.search,
            status: params.status,
            cursor: params.cursor,
            limit: params.limit,
          },
        },
        opts,
      ),
    enabled: true,
  });
}
