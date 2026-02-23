import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type SettingsResponse = InferResponseType<
  (typeof api.admin)['settings']['$get'],
  SuccessStatusCode
>;

export type Settings = NonNullable<SettingsResponse['data']>;

export function useSettings() {
  return useAdminQuery<SettingsResponse>({
    queryKey: ['admin', 'settings'],
    apiFn: (opts) => api.admin.settings.$get({}, opts),
  });
}
