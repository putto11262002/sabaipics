import type { MiddlewareHandler } from 'hono';
import { verifyFtpToken, type FtpTokenPayload } from '../lib/ftp/jwt';
import type { Env } from '../types';

/**
 * Middleware that requires FTP JWT authentication
 *
 * Extracts Bearer token from Authorization header and verifies it.
 * Sets `ftpAuth` in context with { eventId, photographerId }
 *
 * @returns 401 if token is missing, invalid, or expired
 */
export function requireFtpAuth(): MiddlewareHandler<
  Env & { Variables: { ftpAuth?: FtpTokenPayload } }
> {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Missing or invalid token' } },
        401,
      );
    }

    const token = authHeader.slice(7);

    try {
      const payload = await verifyFtpToken(
        c.env.FTP_JWT_SECRET,
        token,
        c.env.FTP_JWT_SECRET_PREVIOUS,
      );
      (c as any).set('ftpAuth', payload);
    } catch (error) {
      return c.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } },
        401,
      );
    }

    return next();
  };
}
