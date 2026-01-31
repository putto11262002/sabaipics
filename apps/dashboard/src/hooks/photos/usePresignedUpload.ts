import { useMutation } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';

/**
 * Presigned URL upload result
 * Returns uploadId for status polling (photoId comes later via status API)
 */
export interface PresignedUploadResult {
  uploadId: string;
  eventId: string;
  fileSize: number;
}

/**
 * Hook for presigned URL upload flow (v2)
 *
 * Flow:
 * 1. POST /uploads/presign → get uploadId + putUrl
 * 2. PUT to R2 directly with required headers
 * 3. Return uploadId for status polling
 *
 * Note: photoId is obtained later via useUploadIntentStatus when status='completed'
 */
export function usePresignedUpload() {
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async ({
      eventId,
      file,
    }: {
      eventId: string;
      file: File;
    }): Promise<PresignedUploadResult> => {
      // Step 1: Get presigned URL from API
      const presignRes = await api.uploads.presign.$post(
        {
          json: {
            eventId,
            contentType: file.type as
              | 'image/jpeg'
              | 'image/png'
              | 'image/heic'
              | 'image/heif'
              | 'image/webp',
            contentLength: file.size,
          },
        },
        await withAuth(getToken)
      );

      if (!presignRes.ok) {
        const body = (await presignRes.json()) as { error?: { code: string; message: string } };
        const error = new Error(body.error?.message || 'Failed to get upload URL') as Error & {
          status: number;
        };
        error.status = presignRes.status;
        throw error;
      }

      const { data: presign } = await presignRes.json();

      // Step 2: Upload directly to R2
      const uploadRes = await fetch(presign.putUrl, {
        method: 'PUT',
        headers: presign.requiredHeaders,
        body: file,
      });

      if (!uploadRes.ok) {
        const error = new Error('Upload to storage failed') as Error & { status: number };
        error.status = uploadRes.status;
        throw error;
      }

      // Step 3: Return uploadId for polling
      return {
        uploadId: presign.uploadId,
        eventId,
        fileSize: file.size,
      };
    },
    retry: false,
  });
}
