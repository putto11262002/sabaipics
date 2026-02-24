import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';
import { useQueryClient } from '@tanstack/react-query';

type DeleteEventResponse = InferResponseType<
  (typeof api.events)[':id']['$delete'],
  SuccessStatusCode
>;

export type DeleteEventInput = { eventId: string };

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useApiMutation<DeleteEventResponse, DeleteEventInput>({
    apiFn: (input, opts) => api.events[':id'].$delete({ param: { id: input.eventId } }, opts),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.removeQueries({ queryKey: ['events', 'detail', vars.eventId] });
    },
  });
}
