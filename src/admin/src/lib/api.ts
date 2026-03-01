import { hc } from 'hono/client';
import type { AppType } from '@/api/src/index';

export type Client = ReturnType<typeof hc<AppType>>;

const hcWithType = (...args: Parameters<typeof hc>): Client => hc<AppType>(...args);

export const api = hcWithType(import.meta.env.VITE_API_URL, {
  init: { credentials: 'include' },
});
