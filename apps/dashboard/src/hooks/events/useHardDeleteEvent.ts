import { useMutation } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';
import type { InferResponseType } from 'hono';

interface HardDeleteEventParams {
  eventId: string;
}
const hardDeleteEvent = api.events[':id']['hard'].$delete;
type response = InferResponseType<typeof hardDeleteEvent>;
type successResponse = InferResponseType<typeof hardDeleteEvent, 200>;
type errrorResponse = Exclude<response, successResponse>;

type HardDeleteResult = successResponse['data'];

export function useHardDeleteEvent() {
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async ({ eventId }: HardDeleteEventParams) => {
      const response = await api.events[':id']['hard'].$delete(
        {
          param: { id: eventId },
        },
        await withAuth(getToken),
      );

      if (!response.ok) {
        const error = (await response.json()) as errrorResponse;
        const message = error.error.message || `Failed to hard delete event: ${response.status}`;
        throw new Error(message);
      }

      return response.json() as Promise<{ data: HardDeleteResult }>;
    },
  });
}
