/**
 * Base error types for the application.
 *
 * MyError: Base error class with retryable flag.
 * Used across queue processing, Rekognition, and other services.
 */

import type { Context } from 'hono';

export interface MyErrorOptions {
  retryable: boolean;
  isThrottle?: boolean;
  cause?: unknown;
  name?: string;
}

/**
 * Base error for all application errors.
 * - retryable: determines ack/retry behavior in queues
 * - isThrottle: if true, report to rate limiter to slow down future batches
 * - cause: original error for logging/debugging
 * - name: error type name (defaults to 'MyError')
 */
export class MyError extends Error {
  retryable: boolean;
  isThrottle?: boolean;

  constructor(message: string, options: MyErrorOptions) {
    super(message);
    this.retryable = options.retryable;
    this.isThrottle = options.isThrottle;
    this.name = options.name ?? 'MyError';

    // Store cause for debugging (non-standard but useful)
    if (options.cause) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

// =============================================================================
// API Error Helpers
// =============================================================================

/**
 * API error code to HTTP status mapping.
 * Extensible - add new codes as needed.
 */
export const API_ERROR_STATUS = {
  // Client errors (4xx)
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  UNAUTHENTICATED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,

  // Server errors (5xx)
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

/**
 * Handler error type for safeTry pattern.
 * - code: maps to HTTP status
 * - message: user-friendly message (returned to client)
 * - cause: original error for logging (NOT returned to client)
 * - headers: optional response headers (e.g., Retry-After for rate limiting)
 */
export type HandlerError = {
  code: ApiErrorCode;
  message: string;
  cause?: unknown;
  headers?: Record<string, string>;
};

/**
 * Return a JSON error response with correct HTTP status.
 * Only returns code and message to client (cause is for logging only).
 *
 * @param c - Hono context
 * @param error - HandlerError object or code/message params
 * @returns JSON response with error shape
 *
 * @example
 * // With HandlerError object (in safeTry .match())
 * .orTee((e) => console.error(`[API] ${e.code}:`, e.cause))
 * .match(
 *   (data) => c.json({ data }, 201),
 *   (e) => apiError(c, e),
 * )
 *
 * // With code and message (simple usage)
 * return apiError(c, 'NOT_FOUND', 'Event not found');
 */
export function apiError(c: Context, codeOrError: ApiErrorCode | HandlerError, message?: string) {
  if (typeof codeOrError === 'object') {
    const { code, message, headers } = codeOrError;
    // Set custom headers if provided (e.g., Retry-After for rate limiting)
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        c.header(key, value);
      }
    }
    return c.json({ error: { code, message } }, API_ERROR_STATUS[code]);
  }
  return c.json({ error: { code: codeOrError, message } }, API_ERROR_STATUS[codeOrError]);
}
