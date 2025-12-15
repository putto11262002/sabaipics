/**
 * Stripe Webhook Route
 *
 * Handles incoming webhooks from Stripe for payment events.
 * Signature verification is done via Stripe's SDK.
 *
 * This route acts as a producer, emitting events to the event bus.
 * Business logic is handled by consumers registered in handlers/stripe.ts.
 *
 * Events emitted:
 * - stripe:checkout.completed: Payment successful
 * - stripe:checkout.expired: Session timed out
 * - stripe:payment.succeeded: Payment confirmed
 * - stripe:payment.failed: Payment failed
 * - stripe:customer.created/updated/deleted: Customer changes
 */

import { Hono } from "hono";
import type Stripe from "stripe";
import {
  createStripeClient,
  verifyWebhookSignature,
  getSessionMetadata,
  extractCustomerId,
} from "../../lib/stripe";
import { eventBus } from "../../events";
import type { StripeEvents } from "../../lib/stripe/events";

/**
 * Environment bindings for Stripe webhook
 */
type StripeWebhookBindings = {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
};

// Create typed producer for Stripe events
const stripeProducer = eventBus.producer<StripeEvents>();

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

    console.log(`[Stripe Webhook] Processing: ${event.type} (${event.id})`);

    // Route event to appropriate handler via event bus
    switch (event.type) {
      // Checkout events
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        stripeProducer.emit("stripe:checkout.completed", {
          session,
          metadata: getSessionMetadata(session),
          customerId: extractCustomerId(session),
        });
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        stripeProducer.emit("stripe:checkout.expired", {
          session,
          metadata: getSessionMetadata(session),
        });
        break;
      }

      // Payment Intent events
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        stripeProducer.emit("stripe:payment.succeeded", {
          paymentIntent,
          customerId: extractCustomerId(paymentIntent),
        });
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const lastError = paymentIntent.last_payment_error;
        stripeProducer.emit("stripe:payment.failed", {
          paymentIntent,
          errorCode: lastError?.code ?? null,
          errorMessage: lastError?.message ?? null,
          declineCode: lastError?.decline_code ?? null,
        });
        break;
      }

      // Customer events
      case "customer.created": {
        const customer = event.data.object as Stripe.Customer;
        stripeProducer.emit("stripe:customer.created", { customer });
        break;
      }

      case "customer.updated": {
        const customer = event.data.object as Stripe.Customer;
        stripeProducer.emit("stripe:customer.updated", { customer });
        break;
      }

      case "customer.deleted": {
        const customer = event.data.object as unknown as Stripe.DeletedCustomer;
        stripeProducer.emit("stripe:customer.deleted", {
          customerId: customer.id,
        });
        break;
      }

      // Unhandled events
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    console.log(`[Stripe Webhook] Processed: ${event.type} (${event.id})`);
    return c.json({ received: true });
  } catch (err) {
    // Signature verification or parsing errors
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Stripe Webhook] Verification failed: ${errorMessage}`);

    // Return 400 for signature errors - Stripe will retry
    return c.json({ error: "Invalid signature" }, 400);
  }
});

export type StripeWebhookRouterType = typeof stripeWebhookRouter;
