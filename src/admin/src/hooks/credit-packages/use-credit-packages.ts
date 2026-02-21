import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type CreditPackagesResponse = InferResponseType<
  typeof api.admin['credit-packages']['$get'],
  SuccessStatusCode
>;

export type CreditPackage = CreditPackagesResponse['data'][number];

export function useCreditPackages() {
  return useAdminQuery<CreditPackagesResponse>({
    queryKey: ['admin', 'credit-packages', 'list'],
    apiFn: (opts) => api.admin['credit-packages'].$get({}, opts),
  });
}
