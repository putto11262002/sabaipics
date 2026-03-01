import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type AdminEventStatsResponse = InferResponseType<
  (typeof api.admin)['events']['stats']['$get'],
  SuccessStatusCode
>;

export type AdminEventStats = AdminEventStatsResponse['data'];

export function useAdminEventStats() {
  return useAdminQuery<AdminEventStatsResponse>({
    queryKey: ['admin', 'events', 'stats'],
    apiFn: (opts) => api.admin.events.stats.$get({}, opts),
    enabled: true,
  });
}
