import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { parseResponse, type ClientResponse } from 'hono/client';
import { useAuth } from '@/auth/react';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

type ClientOpts = { headers: Record<string, string> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UseApiMutationOptions<TData, TVariables> = {
  apiFn: (input: TVariables, opts: ClientOpts) => Promise<ClientResponse<any>>;
  withAuth?: boolean;
} & Omit<UseMutationOptions<TData, RequestError, TVariables>, 'mutationFn'>;

/**
 * Thin wrapper around `useMutation` that handles auth and error normalization.
 *
 * Responsibility: DATA MAPPING ONLY
 * - Injects Bearer token into outgoing requests (client → wire)
 * - Parses Hono `ClientResponse` into typed data (wire → client)
 * - Normalizes errors into `RequestError` discriminated union
 *
 * Callback guidelines for hooks built on this:
 * - `onSuccess` in hook: cache invalidation / data logic ONLY
 * - UI side-effects (toasts, navigation, dialog close) belong in the
 *   COMPONENT, passed via per-call `mutate(input, { onSuccess, onError })`.
 */
export function useApiMutation<TData, TVariables>(
  options: UseApiMutationOptions<TData, TVariables>,
) {
  const { apiFn, withAuth: needsAuth = true, ...rest } = options;
  const { getToken } = useAuth();

  return useMutation<TData, RequestError, TVariables>({
    ...rest,
    mutationFn: async (input) => {
      const headers: Record<string, string> = {};
      if (needsAuth) {
        const token = await getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      try {
        return (await parseResponse(apiFn(input, { headers }))) as TData;
      } catch (e) {
        throw toRequestError(e);
      }
    },
  });
}
