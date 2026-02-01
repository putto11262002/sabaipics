import { useMutation } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';

interface HardDeleteEventParams {
  eventId: string;
}

interface HardDeleteResult {
  success: boolean;
  deleted: {
    database: {
      faces: number;
      photos: number;
      participantSearches: number;
      uploadIntents: number;
      logoUploadIntents: number;
      ftpCredentials: number;
      events: number;
    };
    r2Objects: number;
    rekognitionCollection: boolean;
  };
}

export function useHardDeleteEvent() {
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async ({ eventId }: HardDeleteEventParams) => {
      const response = await api.events[':id']['hard'].$delete(
        {
          param: { id: eventId },
        },
        await withAuth(getToken)
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error?.error || `Failed to hard delete event: ${response.status}`
        );
      }

      return response.json() as Promise<{ data: HardDeleteResult }>;
    },
  });
}
