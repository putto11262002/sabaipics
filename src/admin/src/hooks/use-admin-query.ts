import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { parseResponse, type ClientResponse } from 'hono/client';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

type ClientOpts = { headers: Record<string, string> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UseAdminQueryOptions<TData> = {
  queryKey: unknown[];
  apiFn: (opts: ClientOpts) => Promise<ClientResponse<any>>;
} & Omit<UseQueryOptions<TData, RequestError>, 'queryKey' | 'queryFn'>;

// TODO: Replace with CF Access JWT when wired up
const ADMIN_API_KEY = 'admin-dev-key-change-in-production';

/**
 * Admin variant of useApiQuery.
 *
 * Injects `X-Admin-API-Key` header instead of Clerk Bearer token.
 * When CF Access JWT replaces the API key, only this file changes.
 */
export function useAdminQuery<TData>(options: UseAdminQueryOptions<TData>) {
  const { apiFn, ...rest } = options;

  return useQuery<TData, RequestError>({
    ...rest,
    queryFn: async () => {
      const headers: Record<string, string> = {
        'X-Admin-API-Key': ADMIN_API_KEY,
      };
      try {
        return (await parseResponse(apiFn({ headers }))) as TData;
      } catch (e) {
        throw toRequestError(e);
      }
    },
  });
}
