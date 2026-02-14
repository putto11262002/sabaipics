import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';

export function useRenameStudioLut() {
  const queryClient = useQueryClient();
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await api.studio.luts[':id'].$patch(
        { param: { id }, json: { name } },
        await withAuth(getToken, { headers: { 'Content-Type': 'application/json' } }),
      );

      if (!res.ok) {
        throw new Error('Failed to rename LUT');
      }

      const json = await res.json();
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio', 'luts'] });
    },
  });
}
