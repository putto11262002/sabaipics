import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type DeleteEventResponse = InferResponseType<
  typeof api.events[':id']['$delete'],
  SuccessStatusCode
>;

export type DeleteEventInput = { eventId: string };

export function useDeleteEvent() {
  return useApiMutation<DeleteEventResponse, DeleteEventInput>({
    apiFn: (input, opts) =>
      api.events[':id'].$delete({ param: { id: input.eventId } }, opts),
  });
}
