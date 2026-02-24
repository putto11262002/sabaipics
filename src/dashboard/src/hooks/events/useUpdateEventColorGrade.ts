import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type UpdateColorGradeResponse = InferResponseType<
  (typeof api.events)[':id']['color-grade']['$put'],
  SuccessStatusCode
>;

export type UpdateColorGradeInput = {
  eventId: string;
  lutId: string | null;
  lutIntensity: number;
  includeLuminance: boolean;
};

export function useUpdateEventColorGrade() {
  const queryClient = useQueryClient();

  return useApiMutation<UpdateColorGradeResponse, UpdateColorGradeInput>({
    apiFn: (input, opts) =>
      api.events[':id']['color-grade'].$put(
        {
          param: { id: input.eventId },
          json: {
            lutId: input.lutId,
            lutIntensity: input.lutIntensity,
            includeLuminance: input.includeLuminance,
          },
        },
        opts,
      ),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ['events', 'detail', vars.eventId, 'color-grade'],
      });
    },
  });
}
