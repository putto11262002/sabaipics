import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const listPresets = api.studio['auto-edit'].$get;
type AutoEditPresetsResponse = InferResponseType<typeof listPresets, SuccessStatusCode>;

export type AutoEditPreset = AutoEditPresetsResponse['data'][0];

export function useAutoEditPresets(options?: { limit?: number }) {
  const limit = options?.limit ?? 200;
  const query = useApiQuery<AutoEditPresetsResponse>({
    queryKey: ['studio', 'auto-edit', { limit }],
    apiFn: (opts) => listPresets({ query: { limit } }, opts),
    staleTime: 0,
  });

  return {
    ...query,
    data: query.data?.data,
  };
}
