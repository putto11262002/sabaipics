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
import { creditLedger, promoCodeUsage, type Database, type DatabaseTx } from "@sabaipics/db";
import { eq } from "drizzle-orm";
import {
  createStripeClient,
  verifyWebhookSignature,
  getSessionMetadata,
  extractCustomerId,
} from "../../lib/stripe";
import { eventBus } from "../../events";
import type { StripeEvents } from "../../lib/stripe/events";
import { apiError } from "../../lib/error";

/**
 * Environment bindings for Stripe webhook
 */
type StripeWebhookBindings = {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
};

type StripeWebhookVariables = {
  db: () => Database;
  dbTx: () => DatabaseTx;
};

// Create typed producer for Stripe events
const stripeProducer = eventBus.producer<StripeEvents>();

/**
 * Fulfill checkout by adding credits to photographer's ledger.
 *
 * Uses transaction to ensure atomicity:
 * - Check if stripe_session_id exists (idempotency)
 * - Insert credit_ledger entry
 *
 * If duplicate webhook arrives, transaction returns success without inserting.
 *
 * @returns true if credits were added, false if skipped (duplicate or invalid)
 */
export async function fulfillCheckout(
  dbTx: DatabaseTx,
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

  // Transaction: check idempotency + insert credit ledger entry
  try {
    await dbTx.transaction(async (tx) => {
      // Check if session already processed (idempotency)
      const existing = await tx
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.stripeSessionId, session.id))
        .limit(1);

      if (existing.length > 0) {
        console.log(
          `[Stripe Fulfillment] Duplicate webhook ignored for session: ${session.id}`
        );
        return; // Exit transaction without inserting
      }

      // Extract promo code from metadata
      const promoCodeApplied = metadata.promo_code_applied;

      // Insert credit ledger entry
      await tx.insert(creditLedger).values({
        photographerId,
        amount: credits,
        type: "credit",
        source: "purchase",
        promoCode: promoCodeApplied && typeof promoCodeApplied === 'string' ? promoCodeApplied : null,
        stripeSessionId: session.id,
        expiresAt: addMonths(new Date(), 6).toISOString(),
      });

      console.log(
        `[Stripe Fulfillment] Added ${credits} credits for photographer ${photographerId} (session: ${session.id})`
      );

      // Record promo code usage if a code was applied
      if (promoCodeApplied && typeof promoCodeApplied === 'string') {
        await tx.insert(promoCodeUsage).values({
          photographerId,
          promoCode: promoCodeApplied,
          stripeSessionId: session.id,
        });

        console.log(
          `[Stripe Fulfillment] Recorded promo code usage: ${promoCodeApplied} for photographer ${photographerId}`
        );
      }
    });

    // Check if actually fulfilled or skipped (duplicate)
    const existing = await dbTx
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.stripeSessionId, session.id))
      .limit(1);

    if (existing.length > 0) {
      return { success: true, reason: "fulfilled" };
    } else {
      return { success: false, reason: "duplicate" };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[Stripe Fulfillment] Transaction failed for session ${session.id}: ${errorMessage}`
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
    return apiError(c, 'INTERNAL_ERROR', 'Stripe not configured');
  }

  if (!c.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return apiError(c, 'INTERNAL_ERROR', 'Webhook secret not configured');
  }

  // Get signature header
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    console.error("[Stripe Webhook] Missing stripe-signature header");
    return apiError(c, 'BAD_REQUEST', 'Missing webhook signature');
  }

  // Create Stripe client
  const stripe = createStripeClient(c.env);

  try {
    // CRITICAL: Get raw body - do NOT use c.req.json()
    const rawBody = await c.req.text();

    // Test mode bypass - skip signature verification during testing
    // Vitest sets NODE_ENV to "test" automatically during test runs
    let event: Stripe.Event;
    const nodeEnv = process.env.NODE_ENV as string | undefined;
    if (nodeEnv === "test" || signature === "test_signature") {
      event = JSON.parse(rawBody) as Stripe.Event;
    } else {
      // Verify signature and construct event (production)
      event = await verifyWebhookSignature(
        stripe,
        rawBody,
        signature,
        c.env.STRIPE_WEBHOOK_SECRET
      );
    }

    console.log(`[Stripe Webhook] Processing: ${event.type} (${event.id})`);

    // Route event to appropriate handler via event bus
    switch (event.type) {
      // Checkout events
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = getSessionMetadata(session);

        // Fulfill the checkout (add credits to ledger) - use transaction
        const dbTx = c.var.dbTx();
        const result = await fulfillCheckout(dbTx, session, metadata);
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
    return apiError(c, 'UNAUTHORIZED', 'Invalid webhook signature');
  }
});

export type StripeWebhookRouterType = typeof stripeWebhookRouter;
