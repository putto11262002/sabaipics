import { useQuery } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import { api, useApiClient, withAuth } from '../../lib/api';

const listLuts = api.studio.luts.$get;

export type StudioLut = InferResponseType<typeof listLuts, 200>['data'][0];

export function useStudioLuts(options?: { limit?: number }) {
  const { getToken } = useApiClient();
  const limit = options?.limit ?? 200;

  return useQuery({
    queryKey: ['studio', 'luts', { limit }],
    queryFn: async () => {
      const res = await listLuts({ query: { limit } }, await withAuth(getToken));

      if (!res.ok) {
        throw new Error('Failed to load LUTs');
      }

      const json = await res.json();
      return json.data;
    },
    // LUT creation flow now owns pending/processing state and revalidates on completion.
    // Keep the Studio LUT list stable (no background polling).
    refetchInterval: false,
    staleTime: 0,
  });
}
