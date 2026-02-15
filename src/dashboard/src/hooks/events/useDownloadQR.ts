import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '@/auth/react';
import { type RequestError, toRequestError } from '@/shared/lib/api-error';

/**
 * Cannot use `useApiMutation` wrapper because this endpoint returns a binary
 * blob (PNG image), not JSON. The wrapper's `parseResponse` expects JSON and
 * would fail. Auth and error normalization are handled manually instead.
 */

type QRSize = 'small' | 'medium' | 'large';

export type DownloadQRInput = {
  eventId: string;
  eventName: string;
  size?: QRSize;
};

export function useDownloadQR() {
  const { getToken } = useAuth();

  return useMutation<void, RequestError, DownloadQRInput>({
    mutationFn: async ({ eventId, eventName, size = 'medium' }) => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const response = await api.events[':id']['qr-download'].$get(
          { param: { id: eventId }, query: { size } },
          { headers },
        );

        if (!response.ok) {
          throw new Error(`Failed to download QR code: ${response.status}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${eventName.replace(/[^a-z0-9]/gi, '-')}-${size}-qr.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch (e) {
        throw toRequestError(e);
      }
    },
  });
}
