/**
 * Base error types for the application.
 *
 * MyError: Base error class with retryable flag.
 * Used across queue processing, Rekognition, and other services.
 */

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
