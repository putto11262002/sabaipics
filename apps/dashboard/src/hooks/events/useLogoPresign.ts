import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useLogoPresign() {
  return useMutation({
    mutationFn: async ({
      eventId,
      file,
    }: {
      eventId: string;
      file: File;
    }): Promise<{
      uploadId: string;
      putUrl: string;
      objectKey: string;
      expiresAt: string;
      requiredHeaders: Record<string, string>;
    }> => {
      const response = await api.events[':id'].logo.presign.$post(
        {
          param: { id: eventId },
          json: {
            contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
            contentLength: file.size,
          },
        },
        {
          init: {
            credentials: 'include',
          },
        },
      );

      if (!response.ok) {
        const error = new Error('Failed to get presigned URL') as Error & { status: number };
        error.status = response.status;
        throw error;
      }

      const { data } = await response.json();
      return {
        uploadId: data.uploadId,
        putUrl: data.putUrl,
        objectKey: data.objectKey,
        expiresAt: data.expiresAt,
        requiredHeaders: data.requiredHeaders,
      };
    },
    retry: false,
  });
}
