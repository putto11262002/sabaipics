/**
 * Stripe Checkout Session Utilities
 *
 * Flexible checkout session creation that supports any pricing model
 * (packages, pay-as-you-go, subscriptions, or hybrid).
 *
 * NO hardcoded packages or prices - designed for maximum flexibility.
 */

import type Stripe from "stripe";

// =============================================================================
// Types
// =============================================================================

/**
 * Line item for checkout session
 *
 * Uses price_data for dynamic pricing - no need to create Stripe Price objects upfront.
 */
export interface CheckoutLineItem {
  /** Product name displayed to customer */
  name: string;
  /** Product description (optional) */
  description?: string;
  /** Amount in smallest currency unit (satang for THB, cents for USD) */
  amount: number;
  /** Quantity of items */
  quantity: number;
  /** Custom metadata attached to the product */
  metadata?: Record<string, string>;
}

/**
 * Parameters for creating a checkout session
 */
export interface CreateCheckoutParams {
  /** Stripe client instance */
  stripe: Stripe;
  /** Stripe customer ID (cus_xxx) */
  customerId: string;
  /** Line items to purchase */
  lineItems: CheckoutLineItem[];
  /** URL to redirect after successful payment */
  successUrl: string;
  /** URL to redirect if customer cancels */
  cancelUrl: string;
  /** Custom metadata attached to the session */
  metadata?: Record<string, string>;
  /** Checkout mode: 'payment' (one-time), 'subscription', or 'setup' */
  mode?: "payment" | "subscription" | "setup";
  /** Currency code (default: 'thb') */
  currency?: string;
}

/**
 * Result of creating a checkout session
 */
export interface CheckoutSessionResult {
  /** Checkout session ID */
  sessionId: string;
  /** URL to redirect customer to Stripe Checkout */
  url: string;
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Creates a Stripe Checkout Session with flexible line items
 *
 * This function uses price_data for dynamic pricing, allowing you to
 * specify prices at checkout time without pre-creating Stripe Price objects.
 *
 * @param params - Checkout session parameters
 * @returns Checkout session with redirect URL
 * @throws Stripe.errors.StripeError on API errors
 *
 * @example
 * ```typescript
 * // One-time credit purchase
 * const result = await createCheckoutSession({
 *   stripe,
 *   customerId: 'cus_xxx',
 *   lineItems: [{
 *     name: 'Photo Credits',
 *     description: '500 credits for photo uploads',
 *     amount: 50000, // 500 THB in satang
 *     quantity: 1,
 *     metadata: { credits: '500', package: 'starter' },
 *   }],
 *   successUrl: 'https://app.example.com/success',
 *   cancelUrl: 'https://app.example.com/cancel',
 *   metadata: { photographer_id: 'photo_123' },
 * });
 *
 * // Redirect to: result.url
 * ```
 */
export async function createCheckoutSession({
  stripe,
  customerId,
  lineItems,
  successUrl,
  cancelUrl,
  metadata = {},
  mode = "payment",
  currency = "thb",
}: CreateCheckoutParams): Promise<CheckoutSessionResult> {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode,
    line_items: lineItems.map((item) => ({
      price_data: {
        currency,
        unit_amount: item.amount,
        product_data: {
          name: item.name,
          description: item.description,
          metadata: item.metadata,
        },
      },
      quantity: item.quantity,
    })),
    // Append session ID to success URL for retrieval
    success_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    metadata,
    // Collect billing address for invoices
    billing_address_collection: "auto",
    // Allow promotion codes if you set them up in Stripe
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("Checkout session created but URL is missing");
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Retrieves a checkout session by ID
 *
 * Useful for verifying payment status on success page.
 * Note: Always verify payment via webhooks, not just this function.
 *
 * @param stripe - Stripe client instance
 * @param sessionId - Checkout session ID (cs_xxx)
 * @returns Checkout session object
 *
 * @example
 * ```typescript
 * const session = await getCheckoutSession(stripe, 'cs_test_xxx');
 * if (session.payment_status === 'paid') {
 *   // Show success message (but rely on webhook for actual fulfillment)
 * }
 * ```
 */
export async function getCheckoutSession(
  stripe: Stripe,
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items", "customer"],
  });
}

/**
 * Retrieves line items from a checkout session
 *
 * @param stripe - Stripe client instance
 * @param sessionId - Checkout session ID (cs_xxx)
 * @returns List of line items
 */
export async function getCheckoutLineItems(
  stripe: Stripe,
  sessionId: string
): Promise<Stripe.LineItem[]> {
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);
  return lineItems.data;
}
