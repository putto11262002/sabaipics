import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type UpdateSettingsResponse = InferResponseType<
  (typeof api)['line-delivery']['settings']['$put'],
  SuccessStatusCode
>;

export type UpdateLineDeliverySettingsInput = {
  photoCap: 5 | 10 | 15 | 20 | null;
  overageEnabled: boolean;
};

export function useUpdateLineDeliverySettings() {
  const queryClient = useQueryClient();

  return useApiMutation<UpdateSettingsResponse, UpdateLineDeliverySettingsInput>({
    apiFn: (input, opts) =>
      api['line-delivery'].settings.$put({ json: input }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['line-delivery', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['line-delivery', 'stats'] });
    },
  });
}
