import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminMutation } from '../use-admin-mutation';

type UpdateSettingsResponse = InferResponseType<
  (typeof api.admin)['settings']['$patch'],
  SuccessStatusCode
>;

export type UpdateSettingsInput = {
  signupBonusEnabled?: boolean;
  signupBonusCredits?: number;
  signupBonusCreditExpiresInDays?: number;
};

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useAdminMutation<UpdateSettingsResponse, UpdateSettingsInput>({
    apiFn: (input, opts) =>
      api.admin.settings.$patch({ json: input }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
  });
}
