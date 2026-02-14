import { useQuery } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import { api, useApiClient, withAuth } from '../../lib/api';

const listLuts = api.studio.luts.$get;

export type StudioLut = InferResponseType<typeof listLuts, 200>['data'][0];

function shouldPoll(luts: StudioLut[]): boolean {
  return luts.some((l) => l.status === 'pending' || l.status === 'processing');
}

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
    refetchInterval: (query) => {
      const data = query.state.data as StudioLut[] | undefined;
      if (!data) return false;
      return shouldPoll(data) ? 2000 : false;
    },
    staleTime: 0,
  });
}
