import { useMutation } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';
import type { InferResponseType } from 'hono';

interface DeleteEventParams {
  eventId: string;
}

const deleteEvent = api.events[':id'].$delete;
type response = InferResponseType<typeof deleteEvent>;
type successResponse = InferResponseType<typeof deleteEvent, 200>;
type errorResponse = Exclude<response, successResponse>;

type DeleteResult = successResponse['data'];

export function useDeleteEvent() {
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async ({ eventId }: DeleteEventParams) => {
      const response = await api.events[':id'].$delete(
        {
          param: { id: eventId },
        },
        await withAuth(getToken),
      );

      if (!response.ok) {
        const error = (await response.json()) as errorResponse;
        const message = error.error.message || `Failed to delete event: ${response.status}`;
        throw new Error(message);
      }

      return response.json() as Promise<{ data: DeleteResult }>;
    },
  });
}
