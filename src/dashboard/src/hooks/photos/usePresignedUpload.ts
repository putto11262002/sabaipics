import { useMutation } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { useAuth } from '@/auth/react';
import { api } from '../../lib/api';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

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
 * 1. POST /uploads/presign -> get uploadId + putUrl
 * 2. PUT to R2 directly with required headers
 * 3. Return uploadId for status polling
 *
 * Note: photoId is obtained later via useUploadIntentStatus when status='completed'
 */
export function usePresignedUpload() {
  const { getToken } = useAuth();

  return useMutation<PresignedUploadResult, RequestError, { eventId: string; file: File }>({
    mutationFn: async ({
      eventId,
      file,
    }): Promise<PresignedUploadResult> => {
      const token = await getToken();

      // Step 1: Get presigned URL from API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let presign: any;
      try {
        presign = await parseResponse(
          api.uploads.presign.$post(
            {
              json: {
                eventId,
                contentType: file.type as
                  | 'image/jpeg'
                  | 'image/png'
                  | 'image/webp',
                contentLength: file.size,
              },
            },
            {
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                'Content-Type': 'application/json',
              },
            },
          ),
        );
      } catch (e) {
        throw toRequestError(e);
      }

      // Step 2: Upload directly to R2
      const uploadRes = await fetch(presign.data.putUrl, {
        method: 'PUT',
        headers: presign.data.requiredHeaders,
        body: file,
      });

      if (!uploadRes.ok) {
        throw toRequestError(new Error('Upload to storage failed'));
      }

      // Step 3: Return uploadId for polling
      return {
        uploadId: presign.data.uploadId,
        eventId,
        fileSize: file.size,
      };
    },
    retry: false,
  });
}
