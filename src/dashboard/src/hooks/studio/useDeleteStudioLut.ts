import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';
import { useQueryClient } from '@tanstack/react-query';

type DeleteStudioLutResponse = InferResponseType<
  (typeof api.studio.luts)[':id']['$delete'],
  SuccessStatusCode
>;

export function useDeleteStudioLut() {
  const queryClient = useQueryClient();

  return useApiMutation<DeleteStudioLutResponse, string>({
    apiFn: (id, opts) => api.studio.luts[':id'].$delete({ param: { id } }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio', 'luts'] });
    },
  });
}
