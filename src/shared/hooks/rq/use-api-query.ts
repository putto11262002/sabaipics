import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { parseResponse, type ClientResponse } from 'hono/client';
import { useAuth } from '@/auth/react';
import { toRequestError, isAccountSuspended, type RequestError } from '@/shared/lib/api-error';

type ClientOpts = { headers: Record<string, string> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UseApiQueryOptions<TData> = {
  queryKey: unknown[];
  apiFn: (opts: ClientOpts) => Promise<ClientResponse<any>>;
  withAuth?: boolean;
} & Omit<UseQueryOptions<TData, RequestError>, 'queryKey' | 'queryFn'>;

/**
 * Thin wrapper around `useQuery` that handles auth and error normalization.
 *
 * Responsibility: DATA MAPPING ONLY
 * - Injects Bearer token into outgoing requests (client → wire)
 * - Parses Hono `ClientResponse` into typed data (wire → client)
 * - Normalizes errors into `RequestError` discriminated union
 *
 * UI reactions to query state (loading/error/empty) are handled
 * declaratively in JSX via the returned `isLoading`, `error`, `data`.
 * No toasts, navigation, or dialog state belongs here.
 */
export function useApiQuery<TData>(options: UseApiQueryOptions<TData>) {
  const { apiFn, withAuth: needsAuth = true, ...rest } = options;
  const { getToken, signOut } = useAuth();

  return useQuery<TData, RequestError>({
    ...rest,
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (needsAuth) {
        const token = await getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      try {
        return (await parseResponse(apiFn({ headers }))) as TData;
      } catch (e) {
        const error = toRequestError(e);
        if (isAccountSuspended(error)) signOut();
        throw error;
      }
    },
  });
}
