import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { InferRequestType } from 'hono';

const uploadPhoto = api.photos.$post;

export type UploadPhotoInput = InferRequestType<typeof uploadPhoto>;

export interface UploadPhotoResult {
  id: string;
  eventId: string;
  r2Key: string;
  status: 'uploading' | 'indexing' | 'indexed' | 'failed';
  faceCount: number;
  uploadedAt: string;
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, file }: { eventId: string; file: File }): Promise<UploadPhotoResult> => {
      const response = await uploadPhoto(
        {
          form: {
            file,
            eventId,
          },
        },
        {
          init: {
            credentials: 'include',
          },
        },
      );

      if (!response.ok) {
        const error = new Error('Upload failed') as Error & { status: number };
        error.status = response.status;
        throw error;
      }

      const json = await response.json();
      return json.data as UploadPhotoResult;
    },
    onSuccess: (_, variables) => {
      // Invalidate photos query to refresh gallery
      queryClient.invalidateQueries({
        queryKey: ['event', variables.eventId, 'photos'],
      });
    },
    retry: false,
  });
}
