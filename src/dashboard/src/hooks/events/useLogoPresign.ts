import { api } from '../../lib/api';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from '@/shared/hooks/rq/use-api-mutation';

type LogoPresignResponse = InferResponseType<
  (typeof api.events)[':id']['logo']['presign']['$post'],
  SuccessStatusCode
>;

export type LogoPresignInput = {
  eventId: string;
  file: File;
};

export function useLogoPresign() {
  return useApiMutation<LogoPresignResponse, LogoPresignInput>({
    apiFn: (input, opts) =>
      api.events[':id'].logo.presign.$post(
        {
          param: { id: input.eventId },
          json: {
            contentType: input.file.type as 'image/jpeg' | 'image/png' | 'image/webp',
            contentLength: input.file.size,
          },
        },
        opts,
      ),
    retry: false,
  });
}
