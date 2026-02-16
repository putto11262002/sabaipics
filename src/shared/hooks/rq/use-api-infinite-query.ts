import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { parseResponse, type ClientResponse } from 'hono/client';
import { useAuth } from '@/auth/react';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

type ClientOpts = { headers: Record<string, string> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UseApiInfiniteQueryOptions<TPageData, TPageParam> = {
  queryKey: unknown[];
  apiFn: (pageParam: TPageParam, opts: ClientOpts) => Promise<ClientResponse<any>>;
  withAuth?: boolean;
} & Omit<
  UseInfiniteQueryOptions<
    TPageData,
    RequestError,
    InfiniteData<TPageData, TPageParam>,
    unknown[],
    TPageParam
  >,
  'queryKey' | 'queryFn'
>;

/**
 * Thin wrapper around `useInfiniteQuery` that handles auth and error normalization.
 *
 * Same responsibility as `useApiQuery` — data mapping only:
 * - Injects Bearer token into outgoing requests
 * - Parses Hono `ClientResponse` into typed data
 * - Normalizes errors into `RequestError`
 */
export function useApiInfiniteQuery<TPageData, TPageParam = unknown>(
  options: UseApiInfiniteQueryOptions<TPageData, TPageParam>,
) {
  const { apiFn, withAuth: needsAuth = true, ...rest } = options;
  const { getToken } = useAuth();

  return useInfiniteQuery({
    ...rest,
    queryFn: async (context) => {
      const pageParam = context.pageParam as TPageParam;
      const headers: Record<string, string> = {};
      if (needsAuth) {
        const token = await getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      try {
        return (await parseResponse(apiFn(pageParam, { headers }))) as TPageData;
      } catch (e) {
        throw toRequestError(e);
      }
    },
  });
}
