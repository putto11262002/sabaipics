import type { Photo } from '../../../../../hooks/photos/usePhotos';

export interface UploadQueueItem {
  id: string;
  file: File;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progress?: number;
  error?: string;
  errorStatus?: number;
  photoId?: string; // Set when upload succeeds
}

// Optimistic photo - extends Photo with local upload state
// Before upload completes, we only have local fields
// After upload, we get server fields populated
export type OptimisticPhoto = Partial<Photo> & {
  id: string;
  // Local upload state (client-side, before reaching server)
  localStatus?: 'queued' | 'uploading';
  localError?: string;
  fileName?: string;
  queuedAt: number;
};
