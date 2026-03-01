import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type AdminFeedbackResponse = InferResponseType<
  (typeof api.admin)['feedback']['$get'],
  SuccessStatusCode
>;

export type AdminFeedbackListItem = AdminFeedbackResponse['data'][number];

export type UseAdminFeedbackParams = {
  status?: 'all' | 'new' | 'reviewed' | 'planned' | 'completed' | 'dismissed';
  category?: 'all' | 'suggestion' | 'feature_request' | 'general';
  source?: 'all' | 'dashboard' | 'event_app' | 'ios';
  search?: string;
  cursor?: string;
  limit?: number;
};

export function useAdminFeedback(params: UseAdminFeedbackParams = {}) {
  return useAdminQuery<AdminFeedbackResponse>({
    queryKey: ['admin', 'feedback', 'list', params],
    apiFn: (opts) =>
      api.admin.feedback.$get(
        {
          query: {
            status: params.status,
            category: params.category,
            source: params.source,
            search: params.search,
            cursor: params.cursor,
            limit: params.limit,
          },
        },
        opts,
      ),
  });
}
