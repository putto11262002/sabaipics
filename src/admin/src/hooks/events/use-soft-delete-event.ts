import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type SoftDeleteEventResponse = InferResponseType<
  (typeof api.admin)['events'][':id']['$delete'],
  SuccessStatusCode
>;

export type SoftDeleteEventInput = { id: string };

export function useSoftDeleteEvent() {
  const queryClient = useQueryClient();

  return useAdminMutation<SoftDeleteEventResponse, SoftDeleteEventInput>({
    apiFn: ({ id }, opts) =>
      api.admin.events[':id'].$delete({ param: { id } }, opts),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'events', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'events', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'events', 'detail', variables.id] });
    },
  });
}
