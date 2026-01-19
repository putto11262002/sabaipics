import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface DownloadPhotosParams {
  eventId: string;
  photoIds: string[];
}

export function useDownloadPhotos() {
  return useMutation({
    mutationFn: async ({ eventId, photoIds }: DownloadPhotosParams) => {
      const response = await api.events[':eventId'].photos.download.$post(
        {
          param: { eventId },
          json: { photoIds },
        },
        {
          init: {
            credentials: 'include',
          },
        },
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
    },
  });
}
