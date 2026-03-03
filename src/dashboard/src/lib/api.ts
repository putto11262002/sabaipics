import { hc } from 'hono/client';
import type { AppType } from '@/api/src/index';
import { tracingFetch } from './tracing-fetch';

export type Client = ReturnType<typeof hc<AppType>>;

const hcWithType = (...args: Parameters<typeof hc>): Client => hc<AppType>(...args);

export const api = hcWithType(import.meta.env.VITE_API_URL, {
  init: {
    credentials: 'include',
  },
  fetch: tracingFetch,
});

// For non-hook contexts, create client with token
export function createAuthClient(token: string) {
  return hc<AppType>(import.meta.env.VITE_API_URL, {
    headers: { Authorization: `Bearer ${token}` },
    fetch: tracingFetch,
  });
}
