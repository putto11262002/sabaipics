import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/react';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

export type PreviewStudioLutInput = { id: string; file: File; intensity: number; includeLuminance: boolean };
export type PreviewStudioLutResult = Blob;

export function usePreviewStudioLut() {
  const { getToken } = useAuth();

  // Preview returns a Blob (image binary) via FormData upload.
  // The Hono client wrapper expects JSON responses, so we use raw useMutation.
  return useMutation<
    Blob,
    RequestError,
    { id: string; file: File; intensity: number; includeLuminance: boolean }
  >({
    mutationFn: async ({ id, file, intensity, includeLuminance }) => {
      try {
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
      } catch (e) {
        throw toRequestError(e);
      }
    },
    retry: false,
  });
}
