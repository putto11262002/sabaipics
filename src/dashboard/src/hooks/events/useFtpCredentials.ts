import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

const getFtpCredentials = api.api.ftp.events[':id']['ftp-credentials'].$get;
const revealFtpCredentials = api.api.ftp.events[':id']['ftp-credentials'].reveal.$get;

type FtpCredentialsResponse = InferResponseType<typeof getFtpCredentials, SuccessStatusCode>;
type RevealCredentialsResponse = InferResponseType<typeof revealFtpCredentials, SuccessStatusCode>;

export function useFtpCredentials(eventId: string | undefined) {
  return useApiQuery<FtpCredentialsResponse>({
    queryKey: ['events', 'detail', eventId, 'ftp-credentials'],
    apiFn: (opts) => getFtpCredentials({ param: { id: eventId! } }, opts),
    enabled: !!eventId,
    refetchOnWindowFocus: !import.meta.env.DEV,
    refetchOnMount: false,
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useRevealFtpCredentials(eventId: string | undefined) {
  return useApiMutation<RevealCredentialsResponse, void>({
    apiFn: (_input, opts) => revealFtpCredentials({ param: { id: eventId! } }, opts),
  });
}
