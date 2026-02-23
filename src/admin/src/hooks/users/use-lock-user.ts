import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type LockUserResponse = InferResponseType<
  (typeof api.admin.users)[':id']['lock']['$post'],
  SuccessStatusCode
>;

export type LockUserInput = { id: string };

export function useLockUser() {
  const queryClient = useQueryClient();

  return useAdminMutation<LockUserResponse, LockUserInput>({
    apiFn: ({ id }, opts) =>
      api.admin.users[':id'].lock.$post({ param: { id } }, opts),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'detail', variables.id] });
    },
  });
}
