/**
 * Face Recognition Error Utilities
 *
 * Error classification and formatting helpers.
 * Backoff logic is in src/utils/backoff.ts (shared with other services).
 */

import { isError } from '../../utils/error';

// Re-export backoff utilities from shared location
export { getBackoffDelay, getThrottleBackoffDelay } from '../../utils/backoff';

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Errors that should NOT retry - bad input, won't succeed on retry
 */
const NON_RETRYABLE_ERROR_NAMES = new Set([
  // Invalid image data
  'InvalidImageFormatException',
  'ImageTooLargeException',
  'InvalidParameterException',
  'InvalidS3ObjectException',

  // Resource issues (need manual fix)
  'ResourceNotFoundException', // Collection doesn't exist
  'ResourceAlreadyExistsException',

  // Access issues
  'AccessDeniedException',
  'InvalidPolicyRevisionIdException',
]);

/**
 * Errors that SHOULD retry - transient failures
 */
const RETRYABLE_ERROR_NAMES = new Set([
  // Rate limiting
  'ProvisionedThroughputExceededException',
  'ThrottlingException',
  'LimitExceededException',

  // Service issues
  'InternalServerError',
  'ServiceUnavailableException',
  'ServiceException',

  // Network issues (from SDK)
  'TimeoutError',
  'NetworkingError',
]);

// =============================================================================
// Error Type Guards
// =============================================================================

/**
 * Check if error is retryable (should retry with backoff)
 */
export function isRetryableError(error: unknown): boolean {
  if (!isError(error)) return false;

  // Check by error name
  if (RETRYABLE_ERROR_NAMES.has(error.name)) return true;

  // Check for AWS SDK error codes
  const awsError = error as { code?: string; $metadata?: { httpStatusCode?: number } };

  // Retry on 5xx server errors
  if (awsError.$metadata?.httpStatusCode && awsError.$metadata.httpStatusCode >= 500) {
    return true;
  }

  // Retry on 429 (rate limited)
  if (awsError.$metadata?.httpStatusCode === 429) {
    return true;
  }

  return false;
}

/**
 * Check if error is non-retryable (bad input, will never succeed)
 */
export function isNonRetryableError(error: unknown): boolean {
  if (!isError(error)) return false;

  // Check by error name
  if (NON_RETRYABLE_ERROR_NAMES.has(error.name)) return true;

  // Check for 4xx client errors (except 429)
  const awsError = error as { $metadata?: { httpStatusCode?: number } };
  const status = awsError.$metadata?.httpStatusCode;

  if (status && status >= 400 && status < 500 && status !== 429) {
    return true;
  }

  return false;
}

/**
 * Check if error is specifically a throttling error
 */
export function isThrottlingError(error: unknown): boolean {
  if (!isError(error)) return false;

  return (
    error.name === 'ProvisionedThroughputExceededException' ||
    error.name === 'ThrottlingException' ||
    error.name === 'LimitExceededException'
  );
}

/**
 * Check if error is ResourceAlreadyExistsException (for collection creation)
 */
export function isResourceAlreadyExistsError(errorName?: string): boolean {
  return errorName === 'ResourceAlreadyExistsException';
}

/**
 * Check if error is ResourceNotFoundException (for collection deletion)
 */
export function isResourceNotFoundError(errorName?: string): boolean {
  return errorName === 'ResourceNotFoundException';
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Extract a clean error message for logging/storage
 */
export function formatErrorMessage(error: unknown): string {
  if (!isError(error)) {
    return String(error);
  }

  const awsError = error as {
    name: string;
    message: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  const parts: string[] = [awsError.name];

  if (awsError.code && awsError.code !== awsError.name) {
    parts.push(`(${awsError.code})`);
  }

  if (awsError.$metadata?.httpStatusCode) {
    parts.push(`[${awsError.$metadata.httpStatusCode}]`);
  }

  parts.push(':', awsError.message);

  return parts.join(' ');
}
