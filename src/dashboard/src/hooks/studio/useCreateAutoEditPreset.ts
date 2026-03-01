import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type CreateAutoEditPresetResponse = InferResponseType<
  (typeof api.studio)['auto-edit']['$post'],
  SuccessStatusCode
>;

export type CreateAutoEditPresetInput = {
  name: string;
  contrast: number;
  brightness: number;
  saturation: number;
  sharpness: number;
  autoContrast: boolean;
};

export function useCreateAutoEditPreset() {
  const queryClient = useQueryClient();

  return useApiMutation<CreateAutoEditPresetResponse, CreateAutoEditPresetInput>({
    apiFn: (input, opts) => api.studio['auto-edit'].$post({ json: input }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio', 'auto-edit'] });
    },
  });
}
