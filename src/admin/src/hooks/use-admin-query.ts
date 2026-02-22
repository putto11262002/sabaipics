import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { parseResponse, type ClientResponse } from 'hono/client';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

type ClientOpts = { headers: Record<string, string> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UseAdminQueryOptions<TData> = {
  queryKey: unknown[];
  apiFn: (opts: ClientOpts) => Promise<ClientResponse<any>>;
} & Omit<UseQueryOptions<TData, RequestError>, 'queryKey' | 'queryFn'>;

/**
 * Admin variant of useApiQuery.
 *
 * Behind CF Access, the `Cf-Access-Jwt-Assertion` cookie/header is sent
 * automatically by the browser — no manual header injection needed.
 */
export function useAdminQuery<TData>(options: UseAdminQueryOptions<TData>) {
  const { apiFn, ...rest } = options;

  return useQuery<TData, RequestError>({
    ...rest,
    queryFn: async () => {
      try {
        return (await parseResponse(apiFn({ headers: {} }))) as TData;
      } catch (e) {
        throw toRequestError(e);
      }
    },
  });
}
