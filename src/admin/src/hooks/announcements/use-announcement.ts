import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type AnnouncementResponse = InferResponseType<
  (typeof api.admin)['announcements'][':id']['$get'],
  SuccessStatusCode
>;

export type AnnouncementDetail = AnnouncementResponse['data'];

export function useAnnouncement(id: string) {
  return useAdminQuery<AnnouncementResponse>({
    queryKey: ['admin', 'announcements', 'detail', id],
    apiFn: (opts) =>
      api.admin.announcements[':id'].$get(
        { param: { id } },
        opts,
      ),
    enabled: !!id,
  });
}
