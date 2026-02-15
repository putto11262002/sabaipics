import { useQuery } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';
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

/**
 * Mapped intent status for UI
 * - uploading: still uploading to R2 or processing in queue (pending)
 * - completed: photo record created, has photoId - switch to photo status polling
 * - failed: upload failed or expired
 */
export type MappedIntentStatus = 'uploading' | 'completed' | 'failed';

/** Upload intent with mapped status for UI consumption */
export interface MappedUploadIntent {
  uploadId: string;
  eventId: string;
  status: MappedIntentStatus;
  photoId: string | null;
  errorMessage: string | null;
}

/**
 * Maps API intent status to simplified UI status
 *
 * API statuses → UI statuses:
 * - pending → uploading (still in upload flow)
 * - completed → completed (has photoId, switch to photo polling)
 * - failed/expired → failed
 */
function mapIntentStatus(status: UploadIntentStatus): MappedIntentStatus {
  switch (status) {
    case 'pending':
      return 'uploading';
    case 'completed':
      return 'completed';
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
 * Polls GET /uploads/status until intent is completed (has photoId)
 * or failed. Once completed, caller should switch to photo status polling.
 */
export function useUploadIntentStatus(
  uploadIds: string[],
  options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
  },
) {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['uploads', 'status', uploadIds],
    queryFn: async (): Promise<MappedUploadIntent[]> => {
      if (uploadIds.length === 0) return [];

      const response = await getUploadStatus(
        {
          query: { ids: uploadIds.join(',') },
        },
        await withAuth(getToken)
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
