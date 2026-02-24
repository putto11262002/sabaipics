import type { ApiErrorCode } from '@/api/src/lib/error';
import { DetailedError } from 'hono/client';

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  status: number;
};

export type RequestError =
  | { type: 'API_ERROR'; message: string; error: ApiError }
  | { type: 'UNKNOWN_ERROR'; message: string; error: unknown };

export function isApiError(value: unknown): value is { code: string; message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as any).code === 'string' &&
    typeof (value as any).message === 'string'
  );
}

export function toRequestError(e: unknown): RequestError {
  if (e instanceof DetailedError) {
    const maybeError = (e as any).detail?.data?.error;
    if (isApiError(maybeError)) {
      return {
        type: 'API_ERROR',
        message: maybeError.message,
        error: {
          code: maybeError.code as ApiErrorCode,
          message: maybeError.message,
          status: e.statusCode,
        },
      };
    }
  }
  const message = e instanceof Error ? e.message : 'Something went wrong';
  return { type: 'UNKNOWN_ERROR', message, error: e };
}

/**
 * Check if the error indicates the account has been suspended/locked.
 * Used by API wrappers to force sign-out when the server rejects the session.
 */
export function isAccountSuspended(error: RequestError): boolean {
  return error.type === 'API_ERROR' && error.error.code === 'ACCOUNT_SUSPENDED';
}

/**
 * Status codes that are worth retrying — transient server/infra issues.
 *
 * 429 — rate limited (back off and retry)
 * 500 — might be a transient failure (retry 1-2 times)
 * 502 — bad gateway (upstream down momentarily)
 * 503 — service unavailable (deploy, overload)
 *
 * Everything else (400, 401, 403, 404, 409, etc.) is a client error —
 * the request is wrong and retrying won't help.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);

/** Max retries for retryable errors */
const MAX_RETRIES = 2;

/**
 * React Query `retry` callback.
 *
 * Works with both `RequestError` (from useApiQuery/useApiMutation) and
 * plain `Error` (from QueryClient global defaults).
 *
 * - API errors: retry only if status code is transient
 * - Everything else (network failures, unknown): always retry
 */
export function shouldRetry(failureCount: number, error: RequestError | Error): boolean {
  if (failureCount >= MAX_RETRIES) return false;

  // Plain Error or UNKNOWN_ERROR — likely network, always retry
  if (error instanceof Error) return true;
  if (error.type === 'UNKNOWN_ERROR') return true;

  return RETRYABLE_STATUS_CODES.has(error.error.status);
}
