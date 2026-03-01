import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';
import { useQueryClient } from '@tanstack/react-query';

type HardDeleteEventResponse = InferResponseType<
  (typeof api.events)[':id']['hard']['$delete'],
  SuccessStatusCode
>;

export type HardDeleteEventInput = { eventId: string };

export function useHardDeleteEvent() {
  const queryClient = useQueryClient();

  return useApiMutation<HardDeleteEventResponse, HardDeleteEventInput>({
    apiFn: (input, opts) =>
      api.events[':id']['hard'].$delete({ param: { id: input.eventId } }, opts),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.removeQueries({ queryKey: ['events', 'detail', vars.eventId] });
    },
  });
}
