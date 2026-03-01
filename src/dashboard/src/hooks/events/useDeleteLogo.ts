import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type DeleteLogoResponse = InferResponseType<
  (typeof api.events)[':id']['logo']['$delete'],
  SuccessStatusCode
>;

export function useDeleteLogo() {
  const queryClient = useQueryClient();

  return useApiMutation<DeleteLogoResponse, string>({
    apiFn: (eventId, opts) => api.events[':id'].logo.$delete({ param: { id: eventId } }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
