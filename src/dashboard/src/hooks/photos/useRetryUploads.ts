import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { type InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

const retryUploadIntent = api.uploads.events[':eventId'][':uploadId'].retry.$post;
const retryAllUploadIntents = api.uploads.events[':eventId']['retry-all'].$post;

type RetryUploadIntentResponse = InferResponseType<typeof retryUploadIntent, SuccessStatusCode>;
type RetryAllUploadIntentsResponse = InferResponseType<typeof retryAllUploadIntents, SuccessStatusCode>;

export function useRetryUploadIntent() {
  const queryClient = useQueryClient();

  return useApiMutation<RetryUploadIntentResponse, { eventId: string; uploadId: string }>({
    apiFn: (input, opts) =>
      retryUploadIntent(
        {
          param: {
            eventId: input.eventId,
            uploadId: input.uploadId,
          },
        },
        opts,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['event', variables.eventId, 'upload-intents'],
      });
    },
  });
}

export function useRetryAllUploadIntents() {
  const queryClient = useQueryClient();

  return useApiMutation<RetryAllUploadIntentsResponse, { eventId: string }>({
    apiFn: (input, opts) =>
      retryAllUploadIntents(
        {
          param: {
            eventId: input.eventId,
          },
        },
        opts,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['event', variables.eventId, 'upload-intents'],
      });
    },
  });
}
