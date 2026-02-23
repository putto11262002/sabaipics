import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type EmptyTrashResponse = InferResponseType<
  (typeof api.admin)['events']['empty-trash']['$post'],
  SuccessStatusCode
>;

export function useEmptyTrash() {
  const queryClient = useQueryClient();

  return useAdminMutation<EmptyTrashResponse, void>({
    apiFn: (_input, opts) =>
      api.admin.events['empty-trash'].$post({}, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
    },
  });
}
