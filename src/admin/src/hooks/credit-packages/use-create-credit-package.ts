import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type CreateCreditPackageResponse = InferResponseType<
  typeof api.admin['credit-packages']['$post'],
  SuccessStatusCode
>;

export type CreateCreditPackageInput = {
  name: string;
  credits: number;
  priceThb: number;
  active?: boolean;
  sortOrder?: number;
};

export function useCreateCreditPackage() {
  const queryClient = useQueryClient();

  return useAdminMutation<CreateCreditPackageResponse, CreateCreditPackageInput>({
    apiFn: (input, opts) => api.admin['credit-packages'].$post({ json: input }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'credit-packages', 'list'] });
    },
  });
}
