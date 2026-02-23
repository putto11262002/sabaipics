import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type HardDeleteEventResponse = InferResponseType<
  (typeof api.admin)['events'][':id']['hard']['$delete'],
  SuccessStatusCode
>;

export type HardDeleteEventInput = { id: string };

export function useHardDeleteEvent() {
  const queryClient = useQueryClient();

  return useAdminMutation<HardDeleteEventResponse, HardDeleteEventInput>({
    apiFn: ({ id }, opts) =>
      api.admin.events[':id'].hard.$delete({ param: { id } }, opts),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'events', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'events', 'stats'] });
      queryClient.removeQueries({ queryKey: ['admin', 'events', 'detail', variables.id] });
    },
  });
}
