/**
 * Stripe Webhook Route
 *
 * Handles incoming webhooks from Stripe for payment events.
 * Signature verification is done via Stripe's SDK.
 *
 * Events handled:
 * - checkout.session.completed: Payment successful
 * - checkout.session.expired: Session timed out
 * - payment_intent.succeeded: Payment confirmed
 * - payment_intent.payment_failed: Payment failed
 * - customer.created/updated/deleted: Customer changes
 */

import { Hono } from "hono";
import type Stripe from "stripe";
import {
  createStripeClient,
  verifyWebhookSignature,
  handleWebhookEvent,
  getSessionMetadata,
  extractCustomerId,
} from "../../lib/stripe";

/**
 * Environment bindings for Stripe webhook
 */
type StripeWebhookBindings = {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
};

export const stripeWebhookRouter = new Hono<{
  Bindings: StripeWebhookBindings;
}>().post("/", async (c) => {
  // Validate environment
  if (!c.env.STRIPE_SECRET_KEY) {
    console.error("[Stripe Webhook] STRIPE_SECRET_KEY not configured");
    return c.json({ error: "Stripe not configured" }, 500);
  }

  if (!c.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook secret not configured" }, 500);
  }

  // Get signature header
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    console.error("[Stripe Webhook] Missing stripe-signature header");
    return c.json({ error: "Missing signature" }, 400);
  }

  // Create Stripe client
  const stripe = createStripeClient(c.env);

  try {
    // CRITICAL: Get raw body - do NOT use c.req.json()
    const rawBody = await c.req.text();

    // Verify signature and construct event
    const event = await verifyWebhookSignature(
      stripe,
      rawBody,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET
    );

    // Process event with handlers
    // These are "shell" handlers that log events
    // Actual business logic (credit addition, etc.) will be added later
    const result = await handleWebhookEvent(event, {
      onCheckoutComplete: async (session) => {
        await handleCheckoutComplete(session);
      },
      onCheckoutExpired: async (session) => {
        await handleCheckoutExpired(session);
      },
      onPaymentSuccess: async (paymentIntent) => {
        await handlePaymentSuccess(paymentIntent);
      },
      onPaymentFailed: async (paymentIntent) => {
        await handlePaymentFailed(paymentIntent);
      },
      onCustomerCreated: async (customer) => {
        await handleCustomerCreated(customer);
      },
      onCustomerUpdated: async (customer) => {
        await handleCustomerUpdated(customer);
      },
      onCustomerDeleted: async (customer) => {
        await handleCustomerDeleted(customer);
      },
    });

    if (!result.success) {
      console.error(
        `[Stripe Webhook] Processing failed: ${result.error}`
      );
      // Return 200 to prevent Stripe from retrying for handler errors
      // Only signature/parsing errors should return non-200
      return c.json({ received: true, error: result.error });
    }

    return c.json({ received: true });
  } catch (err) {
    // Signature verification or parsing errors
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Stripe Webhook] Verification failed: ${errorMessage}`);

    // Return 400 for signature errors - Stripe will retry
    return c.json({ error: "Invalid signature" }, 400);
  }
});

// =============================================================================
// Event Handlers (Shell implementations - log only for now)
// =============================================================================

/**
 * Handle checkout.session.completed
 *
 * Called when a customer successfully completes checkout.
 * This is the primary event for fulfillment.
 *
 * TODO: Add credit addition logic when payments table is ready
 */
async function handleCheckoutComplete(
  session: Stripe.Checkout.Session
): Promise<void> {
  const metadata = getSessionMetadata(session);
  const customerId = extractCustomerId(session);

  console.log("========== CHECKOUT COMPLETED ==========");
  console.log("Session ID:", session.id);
  console.log("Customer ID:", customerId);
  console.log("Payment Status:", session.payment_status);
  console.log("Amount Total:", session.amount_total);
  console.log("Currency:", session.currency);
  console.log("Metadata:", JSON.stringify(metadata, null, 2));
  console.log("=========================================");

  // TODO: When database is ready:
  // 1. Create payment record
  // 2. Add credits to photographer's ledger
  // 3. Update photographer's stripe_customer_id if not set
  //
  // const photographerId = metadata.photographer_id;
  // const credits = parseInt(metadata.credits ?? '0', 10);
  // await db.insert(payments).values({...});
  // await db.insert(credit_ledger).values({...});
}

/**
 * Handle checkout.session.expired
 *
 * Called when a checkout session expires without payment.
 * Useful for analytics and abandoned cart recovery.
 */
async function handleCheckoutExpired(
  session: Stripe.Checkout.Session
): Promise<void> {
  const metadata = getSessionMetadata(session);

  console.log("========== CHECKOUT EXPIRED ==========");
  console.log("Session ID:", session.id);
  console.log("Metadata:", JSON.stringify(metadata, null, 2));
  console.log("======================================");

  // TODO: Analytics for abandoned checkouts
}

/**
 * Handle payment_intent.succeeded
 *
 * Called when a payment is confirmed.
 * For Checkout, this fires AFTER checkout.session.completed.
 */
async function handlePaymentSuccess(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  console.log("========== PAYMENT SUCCEEDED ==========");
  console.log("Payment Intent ID:", paymentIntent.id);
  console.log("Amount:", paymentIntent.amount);
  console.log("Currency:", paymentIntent.currency);
  console.log("Customer:", paymentIntent.customer);
  console.log("=======================================");

  // For Checkout flow, fulfillment is handled in checkout.session.completed
  // This event is useful for:
  // - Confirmation/logging
  // - Direct PaymentIntent flows (not using Checkout)
}

/**
 * Handle payment_intent.payment_failed
 *
 * Called when a payment fails.
 */
async function handlePaymentFailed(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const lastError = paymentIntent.last_payment_error;

  console.log("========== PAYMENT FAILED ==========");
  console.log("Payment Intent ID:", paymentIntent.id);
  console.log("Amount:", paymentIntent.amount);
  console.log("Error Code:", lastError?.code);
  console.log("Error Message:", lastError?.message);
  console.log("Decline Code:", lastError?.decline_code);
  console.log("====================================");

  // TODO: Alert monitoring, customer notification
}

/**
 * Handle customer.created
 *
 * Called when a new Stripe customer is created.
 */
async function handleCustomerCreated(
  customer: Stripe.Customer
): Promise<void> {
  console.log("========== CUSTOMER CREATED ==========");
  console.log("Customer ID:", customer.id);
  console.log("Email:", customer.email);
  console.log("Name:", customer.name);
  console.log("Metadata:", JSON.stringify(customer.metadata, null, 2));
  console.log("======================================");

  // Customers are created via our API, so this is mostly for logging
}

/**
 * Handle customer.updated
 *
 * Called when a Stripe customer is updated.
 */
async function handleCustomerUpdated(
  customer: Stripe.Customer
): Promise<void> {
  console.log("========== CUSTOMER UPDATED ==========");
  console.log("Customer ID:", customer.id);
  console.log("Email:", customer.email);
  console.log("Name:", customer.name);
  console.log("======================================");

  // TODO: Sync changes back to photographer record if needed
}

/**
 * Handle customer.deleted
 *
 * Called when a Stripe customer is deleted.
 */
async function handleCustomerDeleted(
  customer: Stripe.DeletedCustomer
): Promise<void> {
  console.log("========== CUSTOMER DELETED ==========");
  console.log("Customer ID:", customer.id);
  console.log("======================================");

  // TODO: Handle customer deletion (clear stripe_customer_id from photographer)
}

export type StripeWebhookRouterType = typeof stripeWebhookRouter;
