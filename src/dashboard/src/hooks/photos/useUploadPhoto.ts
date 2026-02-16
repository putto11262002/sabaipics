import { api } from '../../lib/api';
import type { InferRequestType, InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

const uploadPhoto = api.photos.$post;

type UploadPhotoResponse = InferResponseType<typeof uploadPhoto, SuccessStatusCode>;

export type UploadPhotoInput = InferRequestType<typeof uploadPhoto>;

export interface UploadPhotoResult {
  id: string;
  eventId: string;
  r2Key: string;
  status: 'uploading' | 'indexing' | 'indexed' | 'failed';
  faceCount: number;
  fileSize?: number | null;
  uploadedAt: string;
}

export function useUploadPhoto() {
  return useApiMutation<UploadPhotoResponse, { eventId: string; file: File }>({
    apiFn: (input, opts) =>
      uploadPhoto(
        {
          form: {
            file: input.file,
            eventId: input.eventId,
          },
        },
        opts,
      ),
    // No onSuccess invalidation - optimistic updates handled in useUploadQueue
    retry: false,
  });
}
