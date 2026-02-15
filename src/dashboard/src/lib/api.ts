import { hc } from 'hono/client';
import type { AppType } from '@/api/src/index';
import { useAuth } from '@/auth/react';

export type Client = ReturnType<typeof hc<AppType>>;

const hcWithType = (...args: Parameters<typeof hc>): Client => hc<AppType>(...args);

export const api = hcWithType(import.meta.env.VITE_API_URL, {
  init: {
    credentials: 'include',
  },
});

// Hook for authenticated API calls
export function useApiClient() {
  const { getToken } = useAuth();

  const createAuthClient = async () => {
    const token = await getToken();
    return hc<AppType>(import.meta.env.VITE_API_URL, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  };

  return { api, createAuthClient, getToken };
}

// For non-hook contexts, create client with token
export function createAuthClient(token: string) {
  return hc<AppType>(import.meta.env.VITE_API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Injects Bearer token into Hono client request options
 *
 * Usage:
 * const { getToken } = useApiClient();
 * const res = await api.events[':id'].$get(
 *   { param: { id } },
 *   await withAuth(getToken)
 * );
 */
export async function withAuth(
  getToken: () => Promise<string | null>,
  options: RequestInit = {}
): Promise<{ init: RequestInit }> {
  const token = await getToken();

  return {
    init: {
      credentials: 'include', // Keep cookie support
      ...options,
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  };
}
