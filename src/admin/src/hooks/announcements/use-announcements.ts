import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type AnnouncementsResponse = InferResponseType<
  (typeof api.admin)['announcements']['$get'],
  SuccessStatusCode
>;

export type AnnouncementListItem = AnnouncementsResponse['data'][number];

export type UseAnnouncementsParams = {
  search?: string;
  tag?: 'feature' | 'improvement' | 'fix' | 'maintenance';
  status?: 'all' | 'active' | 'draft';
  cursor?: string;
  limit?: number;
};

export function useAnnouncements(params: UseAnnouncementsParams = {}) {
  return useAdminQuery<AnnouncementsResponse>({
    queryKey: ['admin', 'announcements', 'list', params],
    apiFn: (opts) =>
      api.admin.announcements.$get(
        {
          query: {
            search: params.search,
            tag: params.tag,
            status: params.status,
            cursor: params.cursor,
            limit: params.limit,
          },
        },
        opts,
      ),
    enabled: true,
  });
}
