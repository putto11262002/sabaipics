import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

/**
 * Request logging middleware.
 * Logs method, path, status, duration, and userId for every request.
 * Place early in the middleware chain (after DB injection, before routes).
 */
export function requestLogger(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;

    const method = c.req.method;
    const path = new URL(c.req.url).pathname;
    const status = c.res.status;

    let userId = '-';
    try {
      userId = c.get('auth')?.userId ?? '-';
    } catch {
      // auth variable not registered for this route
    }

    console.log(JSON.stringify({ msg: 'request', method, path, status, duration, userId }));
  };
}
