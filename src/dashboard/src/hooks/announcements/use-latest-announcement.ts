import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

type LatestAnnouncementResponse = InferResponseType<
  (typeof api)['announcements']['latest']['$get'],
  SuccessStatusCode
>;

export type LatestAnnouncement = NonNullable<LatestAnnouncementResponse['data']>;

export function useLatestAnnouncement() {
  return useApiQuery<LatestAnnouncementResponse>({
    queryKey: ['announcements', 'latest'],
    apiFn: (opts) => api.announcements.latest.$get({}, opts),
    withAuth: false,
    staleTime: 5 * 60 * 1000,
  });
}
