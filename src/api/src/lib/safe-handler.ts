import * as Sentry from '@sentry/cloudflare';
import { safeTry, type Err, type Result } from 'neverthrow';
import type { Context, TypedResponse } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { API_ERROR_STATUS, type HandlerError, type ApiErrorCode } from './error';

type ErrorResponseBody = { error: { code: ApiErrorCode; message: string } };

/**
 * Wraps a neverthrow generator into a typed Hono response with
 * built-in observability (Sentry capture + structured logging).
 *
 * The generator captures the Hono context `c` via closure, so
 * safeHandler only needs to be generic over `T` (response data)
 * and `S` (success status code). This preserves:
 * - Typed context (c.req.valid, c.var, c.env) from Hono's middleware chain
 * - Typed response for InferResponseType on the RPC client
 *
 * @example
 * .post('/', requirePhotographer(), zValidator('json', schema), async (c) => {
 *   const body = c.req.valid('json'); // fully typed
 *   return safeHandler(async function* () {
 *     const row = yield* ResultAsync.fromPromise(
 *       db.insert(events).values({ name: body.name }).returning(),
 *       (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'DB error', cause }),
 *     );
 *     return ok({ id: row.id, name: row.name });
 *   }, c, { status: 201 });
 * })
 */
export async function safeHandler<T, S extends ContentfulStatusCode = 200>(
  fn: () => AsyncGenerator<Err<never, HandlerError>, Result<T, HandlerError>>,
  c: Context<any, any, any>,
  options?: { status?: S },
): Promise<
  TypedResponse<{ data: T }, S> | TypedResponse<ErrorResponseBody, ContentfulStatusCode>
> {
  return safeTry(fn)
    .orTee((e) => {
      if (e.cause) console.error('[safeHandler]', e.code, e.cause);
      captureApiError(c, e);
    })
    .match(
      (data) =>
        c.json({ data } as { data: T }, (options?.status ?? 200) as S) as any,
      (e) => {
        const status = API_ERROR_STATUS[e.code] as ContentfulStatusCode;
        if (e.headers) {
          for (const [k, v] of Object.entries(e.headers)) c.header(k, v);
        }
        return c.json(
          { error: { code: e.code, message: e.message } } satisfies ErrorResponseBody,
          status,
        ) as any;
      },
    );
}

/**
 * Capture API errors to Sentry with appropriate severity.
 *
 * - 5xx: captureException (error level) — server failures we must fix
 * - 4xx with cause: captureMessage (warning level) — unexpected failures
 * - 4xx without cause: skip — normal business logic (not found, validation)
 */
function captureApiError(c: Context<any, any, any>, e: HandlerError): void {
  const status = API_ERROR_STATUS[e.code];

  if (status >= 500) {
    Sentry.withScope((scope) => {
      scope.setTag('api_error_code', e.code);
      scope.setTag('http_status', String(status));
      scope.setExtra('path', new URL(c.req.url).pathname);
      scope.setExtra('method', c.req.method);
      scope.setExtra('message', e.message);

      try {
        const auth = c.get('auth');
        if (auth?.userId) scope.setUser({ id: auth.userId });
      } catch {
        // auth variable not registered — fine
      }

      if (e.cause instanceof Error) {
        Sentry.captureException(e.cause);
      } else if (e.cause) {
        Sentry.captureException(new Error(e.message, { cause: e.cause }));
      } else {
        Sentry.captureException(new Error(`[${e.code}] ${e.message}`));
      }
    });
  } else if (e.cause) {
    Sentry.withScope((scope) => {
      scope.setTag('api_error_code', e.code);
      scope.setTag('http_status', String(status));
      scope.setExtra('path', new URL(c.req.url).pathname);
      scope.setExtra('method', c.req.method);
      scope.setExtra('message', e.message);
      scope.setLevel('warning');

      try {
        const auth = c.get('auth');
        if (auth?.userId) scope.setUser({ id: auth.userId });
      } catch {
        // ignore
      }

      Sentry.captureMessage(`[${e.code}] ${e.message}`);
    });
  }
}
