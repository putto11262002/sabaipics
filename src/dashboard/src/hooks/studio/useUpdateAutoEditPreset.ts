import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type UpdateAutoEditPresetResponse = InferResponseType<
  (typeof api.studio)['auto-edit'][':id']['$patch'],
  SuccessStatusCode
>;

export type UpdateAutoEditPresetInput = {
  id: string;
  name: string;
  contrast: number;
  brightness: number;
  saturation: number;
  sharpness: number;
  autoContrast: boolean;
};

export function useUpdateAutoEditPreset() {
  const queryClient = useQueryClient();

  return useApiMutation<UpdateAutoEditPresetResponse, UpdateAutoEditPresetInput>({
    apiFn: (input, opts) =>
      api.studio['auto-edit'][':id'].$patch(
        {
          param: { id: input.id },
          json: {
            name: input.name,
            contrast: input.contrast,
            brightness: input.brightness,
            saturation: input.saturation,
            sharpness: input.sharpness,
            autoContrast: input.autoContrast,
          },
        },
        opts,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio', 'auto-edit'] });
    },
  });
}
