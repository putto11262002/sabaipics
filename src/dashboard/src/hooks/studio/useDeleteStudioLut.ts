import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';

export function useDeleteStudioLut() {
  const queryClient = useQueryClient();
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.studio.luts[':id'].$delete({ param: { id } }, await withAuth(getToken));

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message || 'Failed to delete LUT');
      }

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio', 'luts'] });
    },
  });
}
