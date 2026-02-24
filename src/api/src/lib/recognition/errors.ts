/**
 * Face Recognition v2 — Error Utilities
 *
 * Simple error helpers for RecognitionError discriminated union.
 */

import type { RecognitionError } from './types';

// Re-export backoff utilities from shared location
export { getBackoffDelay, getThrottleBackoffDelay } from '../../utils/backoff';

/**
 * Check if error is retryable (should retry with backoff).
 */
export function isRetryable(error: RecognitionError): boolean {
  return error.retryable;
}

/**
 * Check if error is a throttle (rate limit exceeded).
 */
export function isThrottle(error: RecognitionError): boolean {
  return error.throttle;
}

/**
 * Get a short error name for DB storage / logging.
 */
export function getErrorName(error: RecognitionError): string {
  switch (error.type) {
    case 'extraction_failed':
      return 'ExtractionFailed';
    case 'no_face_detected':
      return 'NoFaceDetected';
    case 'invalid_image':
      return 'InvalidImage';
    case 'database':
      return 'DatabaseError';
  }
}
