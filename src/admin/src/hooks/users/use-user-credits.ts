import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type UserCreditsResponse = InferResponseType<
  (typeof api.admin.users)[':id']['credits']['$get'],
  SuccessStatusCode
>;

export type CreditLedgerEntry = UserCreditsResponse['data'][number];

export function useUserCredits(id: string) {
  return useAdminQuery<UserCreditsResponse>({
    queryKey: ['admin', 'users', 'detail', id, 'credits'],
    apiFn: (opts) =>
      api.admin.users[':id'].credits.$get(
        {
          param: { id },
          query: { limit: 50 },
        },
        opts,
      ),
    enabled: !!id,
  });
}
