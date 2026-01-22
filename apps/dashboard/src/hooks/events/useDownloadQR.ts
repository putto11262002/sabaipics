import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

type QRSize = 'small' | 'medium' | 'large';

interface DownloadQRParams {
  eventId: string;
  eventName: string;
  size?: QRSize;
}

export function useDownloadQR() {
  return useMutation({
    mutationFn: async ({ eventId, eventName, size = 'medium' }: DownloadQRParams) => {
      const response = await api.events[':id']['qr-download'].$get(
        {
          param: { id: eventId },
          query: { size },
        },
        {
          init: {
            credentials: 'include',
          },
        },
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
    },
  });
}
