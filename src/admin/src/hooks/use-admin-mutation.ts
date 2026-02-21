import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { parseResponse, type ClientResponse } from 'hono/client';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

type ClientOpts = { headers: Record<string, string> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UseAdminMutationOptions<TData, TVariables> = {
  apiFn: (input: TVariables, opts: ClientOpts) => Promise<ClientResponse<any>>;
} & Omit<UseMutationOptions<TData, RequestError, TVariables>, 'mutationFn'>;

// TODO: Replace with CF Access JWT when wired up
const ADMIN_API_KEY = 'admin-dev-key-change-in-production';

/**
 * Admin variant of useApiMutation.
 *
 * Injects `X-Admin-API-Key` header instead of Clerk Bearer token.
 * When CF Access JWT replaces the API key, only this file changes.
 */
export function useAdminMutation<TData, TVariables>(
  options: UseAdminMutationOptions<TData, TVariables>,
) {
  const { apiFn, ...rest } = options;

  return useMutation<TData, RequestError, TVariables>({
    ...rest,
    mutationFn: async (input) => {
      const headers: Record<string, string> = {
        'X-Admin-API-Key': ADMIN_API_KEY,
      };
      try {
        return (await parseResponse(apiFn(input, { headers }))) as TData;
      } catch (e) {
        throw toRequestError(e);
      }
    },
  });
}
