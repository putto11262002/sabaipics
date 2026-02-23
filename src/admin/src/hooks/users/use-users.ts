import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type UsersResponse = InferResponseType<
  typeof api.admin.users.$get,
  SuccessStatusCode
>;

export type UserListItem = UsersResponse['data'][number];

export type UseUsersParams = {
  search?: string;
  status?: 'all' | 'active' | 'banned' | 'deleted';
  cursor?: string;
  limit?: number;
};

export function useUsers(params: UseUsersParams = {}) {
  return useAdminQuery<UsersResponse>({
    queryKey: ['admin', 'users', 'list', params],
    apiFn: (opts) =>
      api.admin.users.$get(
        {
          query: {
            search: params.search,
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
