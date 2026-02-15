import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType, InferRequestType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

const getConfig = api.events[':id']['slideshow-config'].$get;
const putConfig = api.events[':id']['slideshow-config'].$put;

type SlideshowConfigResponse = InferResponseType<typeof getConfig, SuccessStatusCode>;
type UpdateSlideshowConfigResponse = InferResponseType<typeof putConfig, SuccessStatusCode>;

export type { SlideshowConfigResponse };

export type UpdateSlideshowConfigInput = InferRequestType<typeof putConfig>['json'];

export function useSlideshowConfig(eventId: string | undefined) {
  return useApiQuery<SlideshowConfigResponse>({
    queryKey: ['events', 'detail', eventId, 'slideshow-config'],
    apiFn: (opts) => getConfig({ param: { id: eventId! } }, opts),
    enabled: !!eventId,
    refetchOnWindowFocus: !import.meta.env.DEV,
    refetchOnMount: false,
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useUpdateSlideshowConfig(eventId: string | undefined) {
  const queryClient = useQueryClient();

  return useApiMutation<UpdateSlideshowConfigResponse, UpdateSlideshowConfigInput>({
    apiFn: (config, opts) =>
      putConfig({ param: { id: eventId! }, json: config }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['events', 'detail', eventId, 'slideshow-config'],
      });
    },
  });
}
