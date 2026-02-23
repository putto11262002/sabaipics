import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type CreateGiftCodeResponse = InferResponseType<
  (typeof api.admin)['gift-codes']['$post'],
  SuccessStatusCode
>;

export type CreateGiftCodeInput = {
  credits: number;
  code?: string;
  description?: string;
  expiresAt?: string;
  creditExpiresInDays?: number;
  maxRedemptions?: number;
  maxRedemptionsPerUser?: number;
};

export function useCreateGiftCode() {
  const queryClient = useQueryClient();

  return useAdminMutation<CreateGiftCodeResponse, CreateGiftCodeInput>({
    apiFn: (input, opts) =>
      api.admin['gift-codes'].$post({ json: input }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'gift-codes', 'list'] });
    },
  });
}
