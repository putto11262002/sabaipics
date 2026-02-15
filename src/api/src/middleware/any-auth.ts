import type { MiddlewareHandler } from 'hono';
import { createClerkAuth } from '@/auth/middleware';
import type { AuthObject } from '@/auth/types';
import { verifyDesktopAccessToken } from '../lib/desktop-auth/jwt';
import type { Env } from '../types';

/**
 * Any-auth middleware
 *
 * Accepts either:
 * - SabaiPics desktop access tokens (Bearer JWT, aud=desktop-api)
 * - Clerk session tokens (existing behavior)
 *
 * This keeps downstream code unchanged by always setting `c.set('auth', { userId, sessionId })`.
 */
export function createAnyAuth(): MiddlewareHandler<Env> {
  // createClerkAuth() is typed against a minimal env; cast to this API's Env.
  const clerkAuth = createClerkAuth() as unknown as MiddlewareHandler<Env>;

  return async (c, next) => {
    // Public desktop auth endpoints must be callable before the client has any auth.
    // Only /desktop/auth/exchange requires an authenticated Clerk session.
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/desktop/auth/') && path !== '/desktop/auth/exchange') {
      c.set('auth', null);
      return next();
    }

    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

      // Try SabaiPics desktop access token first
      try {
        const payload = await verifyDesktopAccessToken({
          secret: c.env.DESKTOP_ACCESS_JWT_SECRET,
          token,
        });

        const auth: AuthObject = {
          userId: payload.clerkUserId,
          sessionId: payload.desktopSessionId,
        };

        c.set('auth', auth);
        return next();
      } catch {
        // Fall through to Clerk verification
      }
    }

    return clerkAuth(c, next);
  };
}
