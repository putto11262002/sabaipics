/**
 * Stripe Integration Library
 *
 * Re-exports all Stripe utilities for clean imports.
 *
 * @example
 * ```typescript
 * import {
 *   createStripeClient,
 *   createCheckoutSession,
 *   verifyWebhookSignature,
 *   isRetryableError,
 * } from '../lib/stripe';
 * ```
 */

// Client
export { createStripeClient, webCrypto, type StripeEnv } from "./client";

// Checkout
export {
  createCheckoutSession,
  getCheckoutSession,
  getCheckoutLineItems,
  type CheckoutLineItem,
  type CreateCheckoutParams,
  type CheckoutSessionResult,
} from "./checkout";

// Customer
export {
  getOrCreateCustomer,
  createCustomer,
  updateCustomer,
  getCustomer,
  findCustomerByPhotographerId,
  type GetOrCreateCustomerParams,
  type CreateCustomerParams,
  type UpdateCustomerParams,
} from "./customer";

// Webhook
export {
  verifyWebhookSignature,
  handleWebhookEvent,
  getSessionMetadata,
  extractCustomerId,
  type WebhookHandlers,
  type WebhookResult,
} from "./webhook";

// Errors
export {
  isRetryableError,
  isRateLimitError,
  isCardError,
  isAuthenticationError,
  isInvalidRequestError,
  getBackoffDelay,
  formatStripeError,
  getCardErrorMessage,
  type FormattedStripeError,
} from "./errors";

// Events
export type { StripeEvents, StripeEventPayload } from "./events";

// Re-export Stripe types for convenience
export type { default as Stripe } from "stripe";
