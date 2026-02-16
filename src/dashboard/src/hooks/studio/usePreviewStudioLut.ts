import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/react';
import { shouldRetry, toRequestError, type RequestError } from '@/shared/lib/api-error';

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
          let message = `Preview failed (${res.status})`;
          try {
            const contentType = res.headers.get('content-type') ?? '';
            if (contentType.includes('application/json')) {
              const json = await res.json();
              const apiMsg = (json as any)?.error?.message ?? (json as any)?.message;
              if (typeof apiMsg === 'string' && apiMsg.trim().length > 0) {
                message = apiMsg;
              }
            }
          } catch {
            // ignore parse errors
          }
          throw new Error(message);
        }

        return await res.blob();
      } catch (e) {
        throw toRequestError(e);
      }
    },
    retry: shouldRetry,
  });
}
