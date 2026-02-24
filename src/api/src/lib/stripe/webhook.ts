/**
 * Stripe Webhook Handling
 *
 * Provides signature verification and event routing for Stripe webhooks.
 * Event handlers are "shells" that log events - actual business logic
 * should be implemented in the application layer.
 */

import type Stripe from 'stripe';
import { webCrypto } from './client';

// =============================================================================
// Types
// =============================================================================

/**
 * Webhook event handlers
 *
 * All handlers are optional - unhandled events are logged but don't fail.
 * Handlers should be idempotent as Stripe may retry delivery.
 */
export interface WebhookHandlers {
  /** Called when a checkout session completes successfully */
  onCheckoutComplete?: (session: Stripe.Checkout.Session) => Promise<void>;
  /** Called when a checkout session expires without payment */
  onCheckoutExpired?: (session: Stripe.Checkout.Session) => Promise<void>;
  /** Called when a payment intent succeeds */
  onPaymentSuccess?: (paymentIntent: Stripe.PaymentIntent) => Promise<void>;
  /** Called when a payment intent fails */
  onPaymentFailed?: (paymentIntent: Stripe.PaymentIntent) => Promise<void>;
  /** Called when a new customer is created */
  onCustomerCreated?: (customer: Stripe.Customer) => Promise<void>;
  /** Called when a customer is updated */
  onCustomerUpdated?: (customer: Stripe.Customer) => Promise<void>;
  /** Called when a customer is deleted */
  onCustomerDeleted?: (customer: Stripe.DeletedCustomer) => Promise<void>;
  /** Called for any unhandled event type (for logging/debugging) */
  onUnhandledEvent?: (event: Stripe.Event) => Promise<void>;
}

/**
 * Result of webhook processing
 */
export interface WebhookResult {
  /** Whether the event was successfully processed */
  success: boolean;
  /** Event type that was processed */
  eventType: string;
  /** Event ID for tracking */
  eventId: string;
  /** Error message if processing failed */
  error?: string;
}

// =============================================================================
// Signature Verification
// =============================================================================

/**
 * Verifies webhook signature and constructs event
 *
 * IMPORTANT: This must be called with the RAW request body (string),
 * not parsed JSON. Use `c.req.text()` in Hono, not `c.req.json()`.
 *
 * @param stripe - Stripe client instance
 * @param rawBody - Raw request body as string
 * @param signature - Value of 'stripe-signature' header
 * @param webhookSecret - Webhook signing secret (whsec_xxx)
 * @returns Verified Stripe event
 * @throws Stripe.errors.StripeSignatureVerificationError on invalid signature
 *
 * @example
 * ```typescript
 * const rawBody = await c.req.text();
 * const signature = c.req.header('stripe-signature');
 *
 * const event = await verifyWebhookSignature(
 *   stripe,
 *   rawBody,
 *   signature,
 *   env.STRIPE_WEBHOOK_SECRET
 * );
 * ```
 */
export async function verifyWebhookSignature(
  stripe: Stripe,
  rawBody: string,
  signature: string,
  webhookSecret: string,
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEventAsync(
    rawBody,
    signature,
    webhookSecret,
    undefined,
    webCrypto,
  );
}

// =============================================================================
// Event Handling
// =============================================================================

/**
 * Routes a webhook event to the appropriate handler
 *
 * Handlers are called based on event type. Unhandled events are logged
 * but don't cause failures - this allows graceful handling of new event types.
 *
 * @param event - Verified Stripe event
 * @param handlers - Object containing handler functions
 * @returns Processing result
 *
 * @example
 * ```typescript
 * const result = await handleWebhookEvent(event, {
 *   onCheckoutComplete: async (session) => {
 *     // Add credits to photographer's account
 *     const photographerId = session.metadata?.photographer_id;
 *     const credits = parseInt(session.metadata?.credits ?? '0', 10);
 *     await addCredits(photographerId, credits);
 *   },
 *   onPaymentFailed: async (paymentIntent) => {
 *     // Log failed payment for monitoring
 *     console.error('Payment failed:', paymentIntent.id);
 *   },
 * });
 * ```
 */
export async function handleWebhookEvent(
  event: Stripe.Event,
  handlers: WebhookHandlers,
): Promise<WebhookResult> {
  console.log(`[Stripe Webhook] Processing: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      // Checkout events
      case 'checkout.session.completed':
        await handlers.onCheckoutComplete?.(event.data.object as Stripe.Checkout.Session);
        break;

      case 'checkout.session.expired':
        await handlers.onCheckoutExpired?.(event.data.object as Stripe.Checkout.Session);
        break;

      // Payment Intent events
      case 'payment_intent.succeeded':
        await handlers.onPaymentSuccess?.(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlers.onPaymentFailed?.(event.data.object as Stripe.PaymentIntent);
        break;

      // Customer events
      case 'customer.created':
        await handlers.onCustomerCreated?.(event.data.object as Stripe.Customer);
        break;

      case 'customer.updated':
        await handlers.onCustomerUpdated?.(event.data.object as Stripe.Customer);
        break;

      case 'customer.deleted':
        await handlers.onCustomerDeleted?.(event.data.object as unknown as Stripe.DeletedCustomer);
        break;

      // Unhandled events
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        await handlers.onUnhandledEvent?.(event);
    }

    console.log(`[Stripe Webhook] Processed: ${event.type} (${event.id})`);

    return {
      success: true,
      eventType: event.type,
      eventId: event.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Stripe Webhook] Error processing ${event.type}: ${errorMessage}`);

    return {
      success: false,
      eventType: event.type,
      eventId: event.id,
      error: errorMessage,
    };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extracts metadata from a checkout session
 *
 * @param session - Stripe Checkout Session
 * @returns Metadata object or empty object
 */
export function getSessionMetadata(session: Stripe.Checkout.Session): Record<string, string> {
  return (session.metadata as Record<string, string>) ?? {};
}

/**
 * Extracts customer ID from various Stripe objects
 *
 * @param obj - Stripe object that may contain a customer reference
 * @returns Customer ID string or null
 */
export function extractCustomerId(
  obj: Stripe.Checkout.Session | Stripe.PaymentIntent,
): string | null {
  const customer = obj.customer;
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  return customer.id;
}
