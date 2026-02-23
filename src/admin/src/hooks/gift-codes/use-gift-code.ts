import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type GiftCodeResponse = InferResponseType<
  (typeof api.admin)['gift-codes'][':id']['$get'],
  SuccessStatusCode
>;

export type GiftCodeDetail = GiftCodeResponse['data'];

export function useGiftCode(id: string) {
  return useAdminQuery<GiftCodeResponse>({
    queryKey: ['admin', 'gift-codes', 'detail', id],
    apiFn: (opts) =>
      api.admin['gift-codes'][':id'].$get(
        { param: { id } },
        opts,
      ),
    enabled: !!id,
  });
}
