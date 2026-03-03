import { safeTry, type Err, type Result } from 'neverthrow';
import type { Context, TypedResponse } from 'hono';
import type { ContentlessStatusCode, SuccessStatusCode } from 'hono/utils/http-status';

/** Success codes that carry a JSON body (excludes 204, 205) */
type ContentfulSuccessStatusCode = Exclude<SuccessStatusCode, ContentlessStatusCode>;
import {
  API_ERROR_STATUS,
  type HandlerError,
  type ApiErrorCode,
  type ApiErrorStatus,
} from './error';
import { emitStructuredLog } from './observability/log';
import { getSafeCauseMeta } from './observability/cause';
import { getCurrentTraceSpan } from './observability/trace-context';

type ErrorResponseBody = { error: { code: ApiErrorCode; message: string } };

/**
 * Wraps a neverthrow generator into a typed Hono response with
 * built-in observability (structured logging + trace error marking).
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
export async function safeHandler<T, S extends ContentfulSuccessStatusCode = 200>(
  fn: () => AsyncGenerator<Err<never, HandlerError>, Result<T, HandlerError>>,
  c: Context<any, any, any>,
  options?: { status?: S },
): Promise<TypedResponse<{ data: T }, S> | TypedResponse<ErrorResponseBody, ApiErrorStatus>> {
  return safeTry(fn)
    .orTee((e) => {
      const status = API_ERROR_STATUS[e.code];
      const level = status >= 500 ? 'error' : 'warn';
      const activeSpan = getCurrentTraceSpan();
      activeSpan?.markError({
        statusMessage: e.code,
        attributes: {
          'api.error.code': e.code,
          'api.error.http_status': status,
        },
      });
      const path = new URL(c.req.url).pathname;
      const causeMeta = getSafeCauseMeta(e.cause);
      let requestId: string | null = null;
      let traceparent: string | null = null;
      try {
        requestId = c.get('requestId');
        traceparent = c.get('traceparent');
      } catch {
        // request logger middleware might not have run in tests
      }

      emitStructuredLog(c, level, 'result_error', {
        request_id: requestId,
        traceparent,
        api_error_code: e.code,
        http_status: status,
        method: c.req.method,
        path,
        message: e.message,
        ...causeMeta,
      });

      if (e.cause) console.error('[safeHandler]', e.code, e.cause);
    })
    .match(
      (data) => c.json({ data } as { data: T }, (options?.status ?? 200) as S) as any,
      (e) => {
        const status = API_ERROR_STATUS[e.code] as ApiErrorStatus;
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
