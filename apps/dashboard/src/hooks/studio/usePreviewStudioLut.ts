import { useMutation } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api';

export function usePreviewStudioLut() {
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async ({
      id,
      file,
      intensity,
      includeLuminance,
    }: {
      id: string;
      file: File;
      intensity: number;
      includeLuminance: boolean;
    }): Promise<Blob> => {
      const token = await getToken();

      const form = new FormData();
      form.set('file', file);
      form.set('intensity', String(intensity));
      form.set('includeLuminance', includeLuminance ? 'true' : 'false');

      const res = await fetch(`${import.meta.env.VITE_API_URL}/studio/luts/${id}/preview`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      if (!res.ok) {
        throw new Error('Preview failed');
      }

      return await res.blob();
    },
    retry: false,
  });
}
