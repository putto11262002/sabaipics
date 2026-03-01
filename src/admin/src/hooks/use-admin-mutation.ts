import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { parseResponse, type ClientResponse } from 'hono/client';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

type ClientOpts = { headers: Record<string, string> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UseAdminMutationOptions<TData, TVariables> = {
  apiFn: (input: TVariables, opts: ClientOpts) => Promise<ClientResponse<any>>;
} & Omit<UseMutationOptions<TData, RequestError, TVariables>, 'mutationFn'>;

/**
 * Admin variant of useApiMutation.
 *
 * Behind CF Access, the `Cf-Access-Jwt-Assertion` cookie/header is sent
 * automatically by the browser — no manual header injection needed.
 */
export function useAdminMutation<TData, TVariables>(
  options: UseAdminMutationOptions<TData, TVariables>,
) {
  const { apiFn, ...rest } = options;

  return useMutation<TData, RequestError, TVariables>({
    ...rest,
    mutationFn: async (input) => {
      try {
        return (await parseResponse(apiFn(input, { headers: {} }))) as TData;
      } catch (e) {
        throw toRequestError(e);
      }
    },
  });
}
