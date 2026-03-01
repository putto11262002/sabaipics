import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type DeleteAutoEditPresetResponse = InferResponseType<
  (typeof api.studio)['auto-edit'][':id']['$delete'],
  SuccessStatusCode
>;

export function useDeleteAutoEditPreset() {
  const queryClient = useQueryClient();

  return useApiMutation<DeleteAutoEditPresetResponse, string>({
    apiFn: (id, opts) => api.studio['auto-edit'][':id'].$delete({ param: { id } }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio', 'auto-edit'] });
    },
  });
}
