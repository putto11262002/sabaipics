/**
 * Stripe Error Handling Utilities
 *
 * Provides error classification, backoff calculation, and error formatting
 * for Stripe API errors.
 */

import Stripe from 'stripe';

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Checks if an error is retryable (safe to retry with idempotency key)
 *
 * Retryable errors include:
 * - Connection errors (network issues)
 * - Rate limit errors (429)
 * - API errors (Stripe internal errors, 500+)
 *
 * @param error - The error to check
 * @returns true if the error is safe to retry
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Stripe.errors.StripeConnectionError) return true;
  if (error instanceof Stripe.errors.StripeRateLimitError) return true;
  if (error instanceof Stripe.errors.StripeAPIError) return true;
  return false;
}

/**
 * Checks if an error is a rate limit error (429)
 *
 * @param error - The error to check
 * @returns true if the error is a rate limit error
 */
export function isRateLimitError(error: unknown): error is Stripe.errors.StripeRateLimitError {
  return error instanceof Stripe.errors.StripeRateLimitError;
}

/**
 * Checks if an error is a card/payment error
 *
 * Card errors occur when a card can't be charged (declined, expired, etc.)
 * These should be shown to the user and NOT retried without user action.
 *
 * @param error - The error to check
 * @returns true if the error is a card error
 */
export function isCardError(error: unknown): error is Stripe.errors.StripeCardError {
  return error instanceof Stripe.errors.StripeCardError;
}

/**
 * Checks if an error is an authentication error
 *
 * Authentication errors occur when the API key is invalid.
 * These should NOT be retried - fix the configuration instead.
 *
 * @param error - The error to check
 * @returns true if the error is an authentication error
 */
export function isAuthenticationError(
  error: unknown,
): error is Stripe.errors.StripeAuthenticationError {
  return error instanceof Stripe.errors.StripeAuthenticationError;
}

/**
 * Checks if an error is an invalid request error
 *
 * Invalid request errors occur when parameters are wrong.
 * These should NOT be retried - fix the request instead.
 *
 * @param error - The error to check
 * @returns true if the error is an invalid request error
 */
export function isInvalidRequestError(
  error: unknown,
): error is Stripe.errors.StripeInvalidRequestError {
  return error instanceof Stripe.errors.StripeInvalidRequestError;
}

// =============================================================================
// Backoff Calculation
// =============================================================================

// Re-export from shared location for backwards compatibility
export { getBackoffDelayMs as getBackoffDelay } from '../../utils/backoff';

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Formatted error response for API responses
 */
export interface FormattedStripeError {
  code: string;
  message: string;
  type: string;
  retryable: boolean;
  declineCode?: string;
  param?: string;
}

/**
 * Formats a Stripe error for API responses
 *
 * Extracts relevant information from Stripe errors for consistent
 * error responses to clients.
 *
 * @param error - The error to format
 * @returns Formatted error object
 *
 * @example
 * ```typescript
 * try {
 *   await stripe.charges.create(...);
 * } catch (err) {
 *   const formatted = formatStripeError(err);
 *   return c.json({ error: formatted }, 400);
 * }
 * ```
 */
/**
 * Maps Stripe error class names to semantic type names
 */
function getSemanticType(error: Stripe.errors.StripeError): string {
  if (error instanceof Stripe.errors.StripeCardError) return 'card_error';
  if (error instanceof Stripe.errors.StripeRateLimitError) return 'rate_limit_error';
  if (error instanceof Stripe.errors.StripeConnectionError) return 'connection_error';
  if (error instanceof Stripe.errors.StripeAPIError) return 'api_error';
  if (error instanceof Stripe.errors.StripeAuthenticationError) return 'authentication_error';
  if (error instanceof Stripe.errors.StripeInvalidRequestError) return 'invalid_request_error';
  if (error instanceof Stripe.errors.StripePermissionError) return 'permission_error';
  if (error instanceof Stripe.errors.StripeIdempotencyError) return 'idempotency_error';
  if (error instanceof Stripe.errors.StripeSignatureVerificationError)
    return 'signature_verification_error';
  return error.type ?? 'stripe_error';
}

export function formatStripeError(error: unknown): FormattedStripeError {
  if (error instanceof Stripe.errors.StripeError) {
    return {
      code: error.code ?? 'STRIPE_ERROR',
      message: error.message,
      type: getSemanticType(error),
      retryable: isRetryableError(error),
      declineCode: error instanceof Stripe.errors.StripeCardError ? error.decline_code : undefined,
      param:
        error instanceof Stripe.errors.StripeInvalidRequestError
          ? (error.param ?? undefined)
          : undefined,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    type: 'unknown',
    retryable: false,
  };
}

/**
 * Gets a user-friendly error message for card errors
 *
 * Maps decline codes to user-friendly messages in Thai/English.
 * Falls back to Stripe's message if no mapping exists.
 *
 * @param error - The card error
 * @returns User-friendly error message
 */
export function getCardErrorMessage(error: Stripe.errors.StripeCardError): string {
  // Map common decline codes to user-friendly messages
  const declineMessages: Record<string, string> = {
    card_declined: 'Your card was declined. Please try another card.',
    insufficient_funds: 'Insufficient funds. Please try another card or add funds.',
    expired_card: 'Your card has expired. Please use a different card.',
    incorrect_cvc: 'Incorrect CVC code. Please check and try again.',
    processing_error: 'A processing error occurred. Please try again in a moment.',
    incorrect_number: 'Invalid card number. Please check and try again.',
  };

  if (error.decline_code && error.decline_code in declineMessages) {
    return declineMessages[error.decline_code];
  }

  // Fall back to Stripe's message
  return error.message;
}
