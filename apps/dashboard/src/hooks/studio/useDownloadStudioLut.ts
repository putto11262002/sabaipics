import { useMutation } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';

export function useDownloadStudioLut() {
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async (id: string): Promise<{ url: string }> => {
      const res = await api.studio.luts[':id'].download.$get(
        { param: { id } },
        await withAuth(getToken),
      );

      if (!res.ok) {
        throw new Error('Failed to get download URL');
      }

      const json = await res.json();
      return { url: json.data.getUrl };
    },
  });
}
