import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type AdminEventsResponse = InferResponseType<
  (typeof api.admin)['events']['$get'],
  SuccessStatusCode
>;

export type AdminEventListItem = AdminEventsResponse['data'][number];

export type UseAdminEventsParams = {
  status?: 'active' | 'expired' | 'trashed';
  search?: string;
  cursor?: string;
  limit?: number;
};

export function useAdminEvents(params: UseAdminEventsParams = {}) {
  return useAdminQuery<AdminEventsResponse>({
    queryKey: ['admin', 'events', 'list', params],
    apiFn: (opts) =>
      api.admin.events.$get(
        {
          query: {
            status: params.status,
            search: params.search,
            cursor: params.cursor,
            limit: params.limit,
          },
        },
        opts,
      ),
    enabled: true,
  });
}
