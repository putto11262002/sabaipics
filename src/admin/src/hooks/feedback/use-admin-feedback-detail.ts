import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type AdminFeedbackDetailResponse = InferResponseType<
  (typeof api.admin)['feedback'][':id']['$get'],
  SuccessStatusCode
>;

export type AdminFeedbackDetail = AdminFeedbackDetailResponse['data'];

export function useAdminFeedbackDetail(id: string) {
  return useAdminQuery<AdminFeedbackDetailResponse>({
    queryKey: ['admin', 'feedback', 'detail', id],
    apiFn: (opts) =>
      api.admin.feedback[':id'].$get(
        { param: { id } },
        opts,
      ),
    enabled: !!id,
  });
}
