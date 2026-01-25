import { hc } from 'hono/client';
import type { AppType } from '@sabaipics/api';
import { useAuth } from '@sabaipics/auth/react';

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
