import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type UpdateGiftCodeResponse = InferResponseType<
  (typeof api.admin)['gift-codes'][':id']['$patch'],
  SuccessStatusCode
>;

export type UpdateGiftCodeInput = {
  id: string;
  active?: boolean;
  description?: string;
  expiresAt?: string | null;
  maxRedemptions?: number | null;
  maxRedemptionsPerUser?: number;
  creditExpiresInDays?: number;
  targetPhotographerIds?: string[] | null;
};

export function useUpdateGiftCode() {
  const queryClient = useQueryClient();

  return useAdminMutation<UpdateGiftCodeResponse, UpdateGiftCodeInput>({
    apiFn: ({ id, ...json }, opts) =>
      api.admin['gift-codes'][':id'].$patch(
        { param: { id }, json },
        opts,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'gift-codes', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'gift-codes', 'detail', variables.id] });
    },
  });
}
