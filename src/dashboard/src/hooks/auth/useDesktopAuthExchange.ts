import { useMutation } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { api } from '../../lib/api';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

export function useDesktopAuthExchange() {
  return useMutation<
    { code: string; expiresAt: number },
    RequestError,
    { clerkToken: string; deviceName?: string }
  >({
    mutationFn: async ({ clerkToken, deviceName }) => {
      try {
        const { code, expiresAt } = await parseResponse(
          api.desktop.auth.exchange.$post(
            { json: { deviceName } },
            { headers: { Authorization: `Bearer ${clerkToken}` } },
          ),
        );
        return { code, expiresAt };
      } catch (e) {
        throw toRequestError(e);
      }
    },
    retry: false,
  });
}
