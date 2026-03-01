import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

type ImagePipelineResponse = InferResponseType<
  (typeof api.events)[':id']['image-pipeline']['$get'],
  SuccessStatusCode
>;

export type EventImagePipeline = ImagePipelineResponse['data'];

export function useEventImagePipeline(eventId: string | undefined) {
  return useApiQuery<ImagePipelineResponse>({
    queryKey: ['events', 'detail', eventId, 'image-pipeline'],
    apiFn: (opts) => api.events[':id']['image-pipeline'].$get({ param: { id: eventId! } }, opts),
    enabled: !!eventId,
    staleTime: 0,
  });
}
