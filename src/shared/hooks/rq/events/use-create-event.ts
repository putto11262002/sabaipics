import { api } from '@/dashboard/src/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import { useApiMutation } from '../use-api-mutation';
import type { SuccessStatusCode } from 'hono/utils/http-status';

type CreateEventResponse = InferResponseType<typeof api.events.$post, SuccessStatusCode>;

export type CreateEventInput = { name: string };
export type Event = CreateEventResponse['data'];

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useApiMutation<CreateEventResponse, CreateEventInput>({
    apiFn: (input, opts) => api.events.$post({ json: input }, opts),
    // Hook-level: cache invalidation only.
    // UI feedback (toast, navigate, close modal) goes in the component's per-call overrides.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
