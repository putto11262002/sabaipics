/**
 * Face Service Error Types
 *
 * Discriminated union error types for FaceService operations.
 * Follows docs/tech/error.md patterns for typed error handling.
 *
 * All errors use plain object pattern with:
 * - type: Discriminant field for error classification
 * - retryable: Whether operation should be retried
 * - throttle: Whether error indicates rate limiting
 * - cause: Original error (if any)
 */

// =============================================================================
// Face Service Error Types
// =============================================================================

/**
 * Domain errors for FaceService operations.
 *
 * Error classification:
 * - not_found: Resource doesn't exist (never retryable)
 * - invalid_input: Bad input (never retryable)
 * - provider_failed: External provider failure (retryable based on provider)
 * - database: Database operation failure (always retryable)
 */
export type FaceServiceError =
  // Domain errors (not retryable)
  | { type: 'not_found'; resource: 'collection' | 'face'; id: string; retryable: false; throttle: false }
  | { type: 'invalid_input'; field: string; reason: string; retryable: false; throttle: false }

  // AWS provider failures - bubbles retryable/throttle from AWS
  | { type: 'provider_failed'; provider: 'aws'; retryable: boolean; throttle: boolean; cause: unknown }

  // SabaiFace provider failures - never retryable (local op)
  | { type: 'provider_failed'; provider: 'sabaiface'; retryable: false; throttle: false; cause: unknown }

  // Database errors - retryable
  | { type: 'database'; operation: string; retryable: true; throttle: false; cause: unknown };

// =============================================================================
// Error Constructor Functions (for ergonomics)
// =============================================================================

/**
 * Create a not_found error.
 */
export function notFound(
  resource: 'collection' | 'face',
  id: string
): FaceServiceError {
  return {
    type: 'not_found',
    resource,
    id,
    retryable: false,
    throttle: false,
  };
}

/**
 * Create an invalid_input error.
 */
export function invalidInput(
  field: string,
  reason: string
): FaceServiceError {
  return {
    type: 'invalid_input',
    field,
    reason,
    retryable: false,
    throttle: false,
  };
}

/**
 * Create a provider_failed error for SabaiFace.
 * Local operation, never retryable.
 */
export function sabaifaceProviderFailed(cause: unknown): FaceServiceError {
  return {
    type: 'provider_failed',
    provider: 'sabaiface',
    retryable: false,
    throttle: false,
    cause,
  };
}

/**
 * Create a database error.
 * Database operations are retryable.
 */
export function databaseError(
  operation: string,
  cause: unknown
): FaceServiceError {
  return {
    type: 'database',
    operation,
    retryable: true,
    throttle: false,
    cause,
  };
}

// =============================================================================
// Type Guards (for convenience)
// =============================================================================

/**
 * Check if error is a not_found error.
 */
export function isNotFound(err: FaceServiceError): err is Extract<FaceServiceError, { type: 'not_found' }> {
  return err.type === 'not_found';
}

/**
 * Check if error is an invalid_input error.
 */
export function isInvalidInput(err: FaceServiceError): err is Extract<FaceServiceError, { type: 'invalid_input' }> {
  return err.type === 'invalid_input';
}

/**
 * Check if error is a provider_failed error.
 */
export function isProviderFailed(err: FaceServiceError): err is Extract<FaceServiceError, { type: 'provider_failed' }> {
  return err.type === 'provider_failed';
}

/**
 * Check if error is a database error.
 */
export function isDatabaseError(err: FaceServiceError): err is Extract<FaceServiceError, { type: 'database' }> {
  return err.type === 'database';
}

/**
 * Check if error is retryable.
 */
export function isRetryable(err: FaceServiceError): boolean {
  return err.retryable;
}

/**
 * Check if error indicates throttling.
 */
export function isThrottle(err: FaceServiceError): boolean {
  return err.throttle;
}

// =============================================================================
// HTTP Status Code Mapping (for API boundary)
// =============================================================================

/**
 * Map FaceServiceError to HTTP status code.
 * Used at API boundary to convert typed errors to HTTP responses.
 */
export function errorToHttpStatus(err: FaceServiceError): number {
  switch (err.type) {
    case 'not_found':
      return 404;
    case 'invalid_input':
      return 400;
    case 'provider_failed':
      // 503 for retryable provider failures (service unavailable)
      // 500 for non-retryable provider failures
      return err.retryable ? 503 : 500;
    case 'database':
      return 500;
    default:
      // Exhaustiveness check
      const _exhaustive: never = err;
      return 500;
  }
}

/**
 * Get error message for API responses.
 */
export function errorMessage(err: FaceServiceError): string {
  switch (err.type) {
    case 'not_found':
      return `${err.resource} not found: ${err.id}`;
    case 'invalid_input':
      return `Invalid input for field '${err.field}': ${err.reason}`;
    case 'provider_failed':
      return `Provider ${err.provider} failed${err.retryable ? ' (retryable)' : ''}`;
    case 'database':
      return `Database operation failed: ${err.operation}`;
    default:
      const _exhaustive: never = err;
      return 'Unknown error';
  }
}
