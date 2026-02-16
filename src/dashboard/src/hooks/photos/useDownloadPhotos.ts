import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/react';
import { api } from '../../lib/api';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

interface DownloadPhotosParams {
  eventId: string;
  photoIds: string[];
}

export function useDownloadPhotos() {
  const { getToken } = useAuth();

  return useMutation<void, RequestError, DownloadPhotosParams>({
    mutationFn: async ({ eventId, photoIds }) => {
      try {
        const token = await getToken();
        const response = await api.events[':eventId'].photos.download.$post(
          {
            param: { eventId },
            json: { photoIds },
          },
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );

        if (!response.ok) {
          throw new Error(`Failed to download: ${response.status}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${eventId}-photos.zip`;
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
