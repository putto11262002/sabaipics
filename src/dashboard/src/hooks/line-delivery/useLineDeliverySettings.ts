import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

const getSettings = api['line-delivery'].settings.$get;
type SettingsResponse = InferResponseType<typeof getSettings, SuccessStatusCode>;

export type LineDeliverySettingsData = SettingsResponse['data'];

export function useLineDeliverySettings() {
  return useApiQuery<SettingsResponse>({
    queryKey: ['line-delivery', 'settings'],
    apiFn: (opts) => getSettings({}, opts),
    staleTime: 1000 * 60,
  });
}
