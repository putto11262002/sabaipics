/**
 * Stripe Webhook Route
 *
 * Handles incoming webhooks from Stripe for payment events.
 * Signature verification is done via Stripe's SDK.
 *
 * Fulfillment logic for checkout.session.completed is implemented directly
 * here (with db access) rather than via event bus handlers.
 *
 * Events emitted (for logging/analytics only):
 * - stripe:checkout.completed: Payment successful
 * - stripe:checkout.expired: Session timed out
 * - stripe:payment.succeeded: Payment confirmed
 * - stripe:payment.failed: Payment failed
 * - stripe:customer.created/updated/deleted: Customer changes
 */

import { Hono } from "hono";
import type Stripe from "stripe";
import { addMonths } from "date-fns";
import { creditLedger, type Database } from "@sabaipics/db";
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

type StripeWebhookVariables = {
  db: () => Database;
};

// Create typed producer for Stripe events
const stripeProducer = eventBus.producer<StripeEvents>();

/**
 * Fulfill checkout by adding credits to photographer's ledger.
 *
 * Idempotency is enforced via unique constraint on stripe_session_id.
 * If duplicate webhook arrives, DB will reject the insert and we return success.
 *
 * @returns true if credits were added, false if skipped (duplicate or invalid)
 */
export async function fulfillCheckout(
  db: Database,
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<{ success: boolean; reason: string }> {
  // Check payment status - only fulfill if paid
  if (session.payment_status !== "paid") {
    console.log(
      `[Stripe Fulfillment] Skipping unpaid session: ${session.id} (status: ${session.payment_status})`
    );
    return { success: false, reason: "unpaid" };
  }

  // Validate required metadata
  const photographerId = metadata.photographer_id;
  const creditsStr = metadata.credits;

  if (!photographerId) {
    console.error(
      `[Stripe Fulfillment] Missing photographer_id in metadata for session: ${session.id}`
    );
    return { success: false, reason: "missing_photographer_id" };
  }

  if (!creditsStr) {
    console.error(
      `[Stripe Fulfillment] Missing credits in metadata for session: ${session.id}`
    );
    return { success: false, reason: "missing_credits" };
  }

  const credits = parseInt(creditsStr, 10);
  if (isNaN(credits) || credits <= 0) {
    console.error(
      `[Stripe Fulfillment] Invalid credits value "${creditsStr}" for session: ${session.id}`
    );
    return { success: false, reason: "invalid_credits" };
  }

  // Validate photographer_id is a valid UUID format
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(photographerId)) {
    console.error(
      `[Stripe Fulfillment] Invalid photographer_id format "${photographerId}" for session: ${session.id}`
    );
    return { success: false, reason: "invalid_photographer_id" };
  }

  // Insert credit ledger entry
  // Unique constraint on stripe_session_id prevents duplicates
  try {
    await db.insert(creditLedger).values({
      photographerId,
      amount: credits,
      type: "purchase",
      stripeSessionId: session.id,
      expiresAt: addMonths(new Date(), 6).toISOString(),
    });

    console.log(
      `[Stripe Fulfillment] Added ${credits} credits for photographer ${photographerId} (session: ${session.id})`
    );
    return { success: true, reason: "fulfilled" };
  } catch (err) {
    // Check for unique constraint violation (duplicate webhook)
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (
      errorMessage.includes("unique") ||
      errorMessage.includes("duplicate") ||
      errorMessage.includes("credit_ledger_stripe_session_unique")
    ) {
      console.log(
        `[Stripe Fulfillment] Duplicate webhook ignored for session: ${session.id}`
      );
      return { success: false, reason: "duplicate" };
    }

    // Other DB errors (e.g., FK violation if photographer doesn't exist)
    console.error(
      `[Stripe Fulfillment] DB error for session ${session.id}: ${errorMessage}`
    );
    return { success: false, reason: "db_error" };
  }
}

export const stripeWebhookRouter = new Hono<{
  Bindings: StripeWebhookBindings;
  Variables: StripeWebhookVariables;
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
        const metadata = getSessionMetadata(session);

        // Fulfill the checkout (add credits to ledger)
        const db = c.var.db();
        const result = await fulfillCheckout(db, session, metadata);
        console.log(
          `[Stripe Webhook] Fulfillment result: ${result.reason} (session: ${session.id})`
        );

        // Emit event for logging/analytics (not for fulfillment)
        stripeProducer.emit("stripe:checkout.completed", {
          session,
          metadata,
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
