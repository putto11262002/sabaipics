import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type UnlockUserResponse = InferResponseType<
  (typeof api.admin.users)[':id']['unlock']['$post'],
  SuccessStatusCode
>;

export type UnlockUserInput = { id: string };

export function useUnlockUser() {
  const queryClient = useQueryClient();

  return useAdminMutation<UnlockUserResponse, UnlockUserInput>({
    apiFn: ({ id }, opts) => api.admin.users[':id'].unlock.$post({ param: { id } }, opts),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'detail', variables.id] });
    },
  });
}
