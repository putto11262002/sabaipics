import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';

type LogoStatusResponse = InferResponseType<
  (typeof api.events)[':id']['logo']['status']['$get'],
  SuccessStatusCode
>;

export function useLogoStatus({ eventId, uploadId }: { eventId: string; uploadId: string | null }) {
  return useApiQuery<LogoStatusResponse>({
    queryKey: ['events', 'detail', eventId, 'logo-status', uploadId],
    apiFn: (opts) =>
      api.events[':id'].logo.status.$get(
        { param: { id: eventId }, query: { id: uploadId! } },
        opts,
      ),
    enabled: !!uploadId,
    refetchInterval: 2000, // Poll every 2 seconds
    staleTime: 0,
  });
}
