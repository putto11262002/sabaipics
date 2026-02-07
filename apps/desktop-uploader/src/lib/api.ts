import { hc } from 'hono/client';

// NOTE: We intentionally avoid typing this client with @sabaipics/api AppType here.
// The monorepo currently resolves multiple hono versions in CI, which can cause
// type-level incompatibilities between the server's AppType and this package's hc().
// Runtime behavior is unaffected.

export const api = hc(import.meta.env.VITE_API_URL) as any;

export function createAuthClient(token: string) {
  return hc(import.meta.env.VITE_API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  }) as any;
}
