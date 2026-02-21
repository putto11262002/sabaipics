import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type UpdateCreditPackageResponse = InferResponseType<
  (typeof api.admin)['credit-packages'][':id']['$patch'],
  SuccessStatusCode
>;

export type UpdateCreditPackageInput = {
  id: string;
  name?: string;
  credits?: number;
  priceThb?: number;
  active?: boolean;
  sortOrder?: number;
};

export function useUpdateCreditPackage() {
  const queryClient = useQueryClient();

  return useAdminMutation<UpdateCreditPackageResponse, UpdateCreditPackageInput>({
    apiFn: ({ id, ...data }, opts) =>
      api.admin['credit-packages'][':id'].$patch({ param: { id }, json: data }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'credit-packages', 'list'] });
    },
  });
}
