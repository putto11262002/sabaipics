import { useMutation } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';

interface DeleteEventParams {
  eventId: string;
}

export function useDeleteEvent() {
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async ({ eventId }: DeleteEventParams) => {
      const response = await api.events[':id'].$delete(
        {
          param: { id: eventId },
        },
        await withAuth(getToken)
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error?.error?.message || `Failed to delete event: ${response.status}`
        );
      }

      return response.json();
    },
  });
}
