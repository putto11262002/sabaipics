import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useAdminQuery } from '../use-admin-query';

type UserDetailResponse = InferResponseType<
  (typeof api.admin.users)[':id']['$get'],
  SuccessStatusCode
>;

export type UserDetail = UserDetailResponse['data']['user'];
export type UserStats = UserDetailResponse['data']['stats'];

export function useUser(id: string) {
  return useAdminQuery<UserDetailResponse>({
    queryKey: ['admin', 'users', 'detail', id],
    apiFn: (opts) => api.admin.users[':id'].$get({ param: { id } }, opts),
    enabled: !!id,
  });
}
