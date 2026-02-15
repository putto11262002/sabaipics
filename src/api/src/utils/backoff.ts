/**
 * Backoff Utilities
 *
 * Generic exponential backoff calculation with jitter.
 * Used by rekognition, stripe, and other services that need retry logic.
 */

// =============================================================================
// Backoff Calculation
// =============================================================================

/**
 * Calculate exponential backoff delay with jitter.
 *
 * Formula: min(base * 2^(attempt-1), maxDelay) + jitter
 *
 * @param attempt - The retry attempt number (1-based)
 * @param baseDelaySeconds - Base delay in seconds (default: 2)
 * @param maxDelaySeconds - Maximum delay cap in seconds (default: 300 = 5 min)
 * @returns Delay in seconds
 *
 * @example
 * ```typescript
 * // Attempt 1: ~2s, Attempt 2: ~4s, Attempt 3: ~8s
 * const delay = getBackoffDelay(attempt);
 * message.retry({ delaySeconds: delay });
 * ```
 */
export function getBackoffDelay(
  attempt: number,
  baseDelaySeconds: number = 2,
  maxDelaySeconds: number = 300,
): number {
  // Exponential: 2, 4, 8, 16, 32, 64, 128, 256, 300 (capped)
  const exponentialDelay = baseDelaySeconds * Math.pow(2, attempt - 1);

  // Cap at max
  const cappedDelay = Math.min(exponentialDelay, maxDelaySeconds);

  // Add jitter (±20%) to prevent thundering herd
  const jitter = cappedDelay * 0.2 * (Math.random() - 0.5);

  return Math.round(cappedDelay + jitter);
}

/**
 * Get backoff delay specifically for throttling errors.
 * Uses longer base delay since rate limits need time to reset.
 *
 * @param attempt - The retry attempt number (1-based)
 * @returns Delay in seconds
 */
export function getThrottleBackoffDelay(attempt: number): number {
  // Start at 5 seconds, longer backoff for throttling
  return getBackoffDelay(attempt, 5, 300);
}

/**
 * Calculate exponential backoff delay in milliseconds.
 * Useful for Stripe and other services that use milliseconds.
 *
 * @param attempt - The retry attempt number (1-based)
 * @param baseDelayMs - Base delay in milliseconds (default: 1000)
 * @param maxDelayMs - Maximum delay cap in milliseconds (default: 30000)
 * @returns Delay in milliseconds
 */
export function getBackoffDelayMs(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000,
): number {
  const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
  // Add jitter (0-1000ms) to prevent thundering herd
  const jitter = Math.random() * 1000;
  return exponentialDelay + jitter;
}
