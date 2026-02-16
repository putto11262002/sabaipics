import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const listLuts = api.studio.luts.$get;
type StudioLutsResponse = InferResponseType<typeof listLuts, SuccessStatusCode>;

export type StudioLut = StudioLutsResponse['data'][0];

export function useStudioLuts(options?: { limit?: number }) {
  const limit = options?.limit ?? 200;

  const query = useApiQuery<StudioLutsResponse>({
    queryKey: ['studio', 'luts', { limit }],
    apiFn: (opts) => listLuts({ query: { limit } }, opts),
    // LUT creation flow now owns pending/processing state and revalidates on completion.
    // Keep the Studio LUT list stable (no background polling).
    refetchInterval: false,
    staleTime: 0,
  });

  return {
    ...query,
    data: query.data?.data,
  };
}
