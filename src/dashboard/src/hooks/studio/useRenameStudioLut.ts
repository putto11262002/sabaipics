import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';
import { useQueryClient } from '@tanstack/react-query';

type RenameStudioLutResponse = InferResponseType<
  (typeof api.studio.luts)[':id']['$patch'],
  SuccessStatusCode
>;

export function useRenameStudioLut() {
  const queryClient = useQueryClient();

  return useApiMutation<RenameStudioLutResponse, { id: string; name: string }>({
    apiFn: (input, opts) =>
      api.studio.luts[':id'].$patch({ param: { id: input.id }, json: { name: input.name } }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio', 'luts'] });
    },
  });
}
