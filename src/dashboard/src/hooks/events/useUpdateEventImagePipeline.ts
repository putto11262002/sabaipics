import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType, InferRequestType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type UpdateImagePipelineResponse = InferResponseType<
  (typeof api.events)[':id']['image-pipeline']['$put'],
  SuccessStatusCode
>;

type UpdateImagePipelineBody = InferRequestType<
  (typeof api.events)[':id']['image-pipeline']['$put']
>['json'];

export type UpdateImagePipelineInput = {
  eventId: string;
} & UpdateImagePipelineBody;

export function useUpdateEventImagePipeline() {
  const queryClient = useQueryClient();

  return useApiMutation<UpdateImagePipelineResponse, UpdateImagePipelineInput>({
    apiFn: (input, opts) =>
      api.events[':id']['image-pipeline'].$put(
        {
          param: { id: input.eventId },
          json: {
            autoEdit: input.autoEdit,
            autoEditPresetId: input.autoEditPresetId,
            autoEditIntensity: input.autoEditIntensity,
            lutId: input.lutId,
            lutIntensity: input.lutIntensity,
            includeLuminance: input.includeLuminance,
          },
        },
        opts,
      ),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ['events', 'detail', vars.eventId, 'image-pipeline'],
      });
    },
  });
}
