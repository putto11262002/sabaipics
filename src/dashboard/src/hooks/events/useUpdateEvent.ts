import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type UpdateEventResponse = InferResponseType<
  typeof api.events[':id']['$put'],
  SuccessStatusCode
>;

export type UpdateEventInput = {
  id: string;
  name?: string;
  subtitle?: string | null;
};

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useApiMutation<UpdateEventResponse, UpdateEventInput>({
    apiFn: (input, opts) =>
      api.events[':id'].$put(
        { param: { id: input.id }, json: { name: input.name, subtitle: input.subtitle } },
        opts,
      ),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['events', 'detail', vars.id] });
    },
  });
}
