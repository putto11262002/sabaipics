import { api } from '@/dashboard/src/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import { useApiMutation } from './use-api-mutation';
import { SuccessStatusCode } from 'hono/utils/http-status';

type CreateEventResponse = InferResponseType<typeof api.events.$post, SuccessStatusCode>;

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useApiMutation<CreateEventResponse, { name: string }>({
    apiFn: (input, opts) => api.events.$post({ json: input }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
