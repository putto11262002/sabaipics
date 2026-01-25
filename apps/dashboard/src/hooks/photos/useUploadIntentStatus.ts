import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { InferResponseType } from 'hono';

// =============================================================================
// Types inferred from API
// =============================================================================

const getUploadStatus = api.uploads.status.$get;

/** Upload intent status from API (inferred from response type) */
export type UploadIntent = InferResponseType<typeof getUploadStatus, 200>['data'][0];

/** Upload intent status enum (inferred from API) */
export type UploadIntentStatus = UploadIntent['status'];

// =============================================================================
// Mapped types for UI
// =============================================================================

/** Mapped status for UI (matches existing photo status flow) */
export type MappedUploadStatus = 'uploading' | 'indexing' | 'indexed' | 'failed';

/** Upload intent with mapped status for UI consumption */
export interface MappedUploadIntent {
  uploadId: string;
  eventId: string;
  status: MappedUploadStatus;
  photoId: string | null;
  errorMessage: string | null;
}

/**
 * Maps API intent status to UI status
 *
 * API statuses → UI statuses:
 * - pending → uploading (waiting for R2 upload to complete)
 * - uploaded → indexing (processing in queue)
 * - completed → indexed (done, has photoId)
 * - failed/expired → failed
 */
function mapIntentStatus(status: UploadIntentStatus): MappedUploadStatus {
  switch (status) {
    case 'pending':
      return 'uploading';
    case 'uploaded':
      return 'indexing';
    case 'completed':
      return 'indexed';
    case 'failed':
    case 'expired':
      return 'failed';
    default:
      return 'uploading';
  }
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for polling upload intent status (v2 presigned upload flow)
 *
 * Polls GET /uploads/status for upload intents and maps statuses
 * to the existing UI status model (uploading → indexing → indexed)
 */
export function useUploadIntentStatus(
  uploadIds: string[],
  options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
  },
) {
  return useQuery({
    queryKey: ['uploads', 'status', uploadIds],
    queryFn: async (): Promise<MappedUploadIntent[]> => {
      if (uploadIds.length === 0) return [];

      const response = await getUploadStatus(
        {
          query: { ids: uploadIds.join(',') },
        },
        {
          init: {
            credentials: 'include',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to fetch upload statuses');
      }

      const json = await response.json();

      // Map API response to UI-friendly format
      return json.data.map((intent: UploadIntent) => ({
        uploadId: intent.uploadId,
        eventId: intent.eventId,
        status: mapIntentStatus(intent.status),
        photoId: intent.photoId,
        errorMessage: intent.errorMessage,
      }));
    },
    enabled: options?.enabled !== false && uploadIds.length > 0,
    refetchInterval: options?.refetchInterval,
    staleTime: 0,
  });
}
