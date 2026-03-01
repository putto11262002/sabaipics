import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type AdminEventResponse = InferResponseType<
  (typeof api.admin)['events'][':id']['$get'],
  SuccessStatusCode
>;

export type AdminEventDetail = AdminEventResponse['data'];

export function useAdminEvent(id: string) {
  return useAdminQuery<AdminEventResponse>({
    queryKey: ['admin', 'events', 'detail', id],
    apiFn: (opts) =>
      api.admin.events[':id'].$get(
        { param: { id } },
        opts,
      ),
    enabled: !!id,
  });
}
