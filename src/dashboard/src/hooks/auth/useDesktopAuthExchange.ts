import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useDesktopAuthExchange() {
  return useMutation({
    mutationFn: async ({
      clerkToken,
      deviceName,
    }: {
      clerkToken: string;
      deviceName?: string;
    }): Promise<{ code: string; expiresAt: number }> => {
      const res = await api.desktop.auth.exchange.$post(
        {
          json: { deviceName },
        },
        {
          headers: {
            Authorization: `Bearer ${clerkToken}`,
          },
        },
      );

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const json = (await res.json()) as { error?: { message?: string } };
          message = json?.error?.message ?? message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const { code, expiresAt } = (await res.json()) as { code: string; expiresAt: number };
      return { code, expiresAt };
    },
    retry: false,
  });
}
