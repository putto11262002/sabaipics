import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, useApiClient } from '../../lib/api';

export function useRenameStudioLut() {
  const queryClient = useQueryClient();
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const token = await getToken();
      const res = await api.studio.luts[':id'].$patch(
        { param: { id }, json: { name } },
        token
          ? {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          : undefined,
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
