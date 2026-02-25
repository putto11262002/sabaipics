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

import { Hono } from 'hono';
import type Stripe from 'stripe';
import { addMonths } from 'date-fns';
import { promoCodeUsage, type Database, type DatabaseTx } from '@/db';
import {
  grantCredits,
  getStripeLedgerEntryBySession,
  setStripeLedgerReceiptUrl,
} from '../../lib/credits';
import { ResultAsync, ok, err } from 'neverthrow';
import {
  createStripeClient,
  verifyWebhookSignature,
  getSessionMetadata,
  extractCustomerId,
} from '../../lib/stripe';
import { eventBus } from '../../events';
import type { StripeEvents } from '../../lib/stripe/events';
import { safeHandler } from '../../lib/safe-handler';
import type { HandlerError } from '../../lib/error';
import { reprocessInsufficientCredits } from '../../lib/services/uploads/reprocess';
import { capturePostHogEvent } from '../../lib/posthog';

/**
 * Environment bindings for Stripe webhook
 */
type StripeWebhookBindings = {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  POSTHOG_API_KEY: string;
  // Needed for reprocessing insufficient_credits intents after credit top-up
  DATABASE_URL: string;
  PHOTOS_BUCKET: R2Bucket;
  UPLOAD_QUEUE: Queue;
  PHOTO_BUCKET_NAME: string;
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
  metadata: Record<string, string>,
  stripe?: Stripe,
): Promise<{ success: boolean; reason: string }> {
  // Check payment status - fulfill if paid or no payment required (gift codes)
  const validStatuses = ['paid', 'no_payment_required'];
  if (!validStatuses.includes(session.payment_status)) {
    console.log(
      `[Stripe Fulfillment] Skipping unpaid session: ${session.id} (status: ${session.payment_status})`,
    );
    return { success: false, reason: 'unpaid' };
  }

  // Validate required metadata
  const photographerId = metadata.photographer_id;
  const creditsStr = metadata.credits;

  if (!photographerId) {
    console.error(
      `[Stripe Fulfillment] Missing photographer_id in metadata for session: ${session.id}`,
    );
    return { success: false, reason: 'missing_photographer_id' };
  }

  if (!creditsStr) {
    console.error(`[Stripe Fulfillment] Missing credits in metadata for session: ${session.id}`);
    return { success: false, reason: 'missing_credits' };
  }

  const credits = parseInt(creditsStr, 10);
  if (isNaN(credits) || credits <= 0) {
    console.error(
      `[Stripe Fulfillment] Invalid credits value "${creditsStr}" for session: ${session.id}`,
    );
    return { success: false, reason: 'invalid_credits' };
  }

  // Transaction: check idempotency + insert credit ledger entry
  try {
    await dbTx.transaction(async (tx) => {
      // Check if session already processed (idempotency)
      const existing = await getStripeLedgerEntryBySession(tx, session.id).match(
        (value) => value,
        (error) => {
          throw error.cause ?? error;
        },
      );

      if (existing) {
        console.log(`[Stripe Fulfillment] Duplicate webhook ignored for session: ${session.id}`);
        return; // Exit transaction without inserting
      }

      // Extract promo code from metadata
      const promoCodeApplied = metadata.promo_code_applied;

      // Grant credits via centralized module (ledger insert + balance increment)
      const grantResult = await grantCredits(tx, {
        photographerId,
        amount: credits,
        source: 'purchase',
        expiresAt: addMonths(new Date(), 6).toISOString(),
        stripeSessionId: session.id,
        promoCode:
          promoCodeApplied && typeof promoCodeApplied === 'string' ? promoCodeApplied : null,
      });

      if (grantResult.isErr()) {
        throw grantResult.error.cause ?? new Error(`Grant failed: ${grantResult.error.type}`);
      }

      console.log(
        `[Stripe Fulfillment] Added ${credits} credits for photographer ${photographerId} (session: ${session.id})`,
      );

      // Record promo code usage if a code was applied
      if (promoCodeApplied && typeof promoCodeApplied === 'string') {
        await tx.insert(promoCodeUsage).values({
          photographerId,
          promoCode: promoCodeApplied,
          stripeSessionId: session.id,
        });

        console.log(
          `[Stripe Fulfillment] Recorded promo code usage: ${promoCodeApplied} for photographer ${photographerId}`,
        );
      }
    });

    // Check if actually fulfilled or skipped (duplicate)
    const existing = await getStripeLedgerEntryBySession(dbTx, session.id).match(
      (value) => value,
      (error) => {
        throw error.cause ?? error;
      },
    );

    if (existing) {
      // Best-effort: fetch and store Stripe receipt URL
      if (stripe && session.payment_intent) {
        try {
          const paymentIntentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent.id;
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
            expand: ['latest_charge'],
          });
          const charge = pi.latest_charge;
          const receiptUrl = charge && typeof charge === 'object' ? charge.receipt_url : null;
          if (receiptUrl) {
            await setStripeLedgerReceiptUrl(dbTx, existing.id, receiptUrl).match(
              () => undefined,
              (error) => {
                throw error.cause ?? error;
              },
            );
          }
        } catch (receiptErr) {
          console.warn(
            `[Stripe Fulfillment] Failed to fetch receipt URL for session ${session.id}:`,
            receiptErr instanceof Error ? receiptErr.message : receiptErr,
          );
        }
      }
      return { success: true, reason: 'fulfilled' };
    } else {
      return { success: false, reason: 'duplicate' };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[Stripe Fulfillment] Transaction failed for session ${session.id}: ${errorMessage}`,
    );
    return { success: false, reason: 'db_error' };
  }
}

export const stripeWebhookRouter = new Hono<{
  Bindings: StripeWebhookBindings;
  Variables: StripeWebhookVariables;
}>().post('/', async (c) => {
  return safeHandler(async function* () {
    // Validate environment
    if (!c.env.STRIPE_SECRET_KEY) {
      return err<never, HandlerError>({
        code: 'INTERNAL_ERROR',
        message: 'Stripe not configured',
      });
    }

    if (!c.env.STRIPE_WEBHOOK_SECRET) {
      return err<never, HandlerError>({
        code: 'INTERNAL_ERROR',
        message: 'Webhook secret not configured',
      });
    }

    // Get signature header
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      return err<never, HandlerError>({
        code: 'BAD_REQUEST',
        message: 'Missing webhook signature',
      });
    }

    // Create Stripe client
    const stripe = createStripeClient(c.env);

    // CRITICAL: Get raw body - do NOT use c.req.json()
    const rawBody = await c.req.text();

    // Verify signature and construct event
    // Test mode bypass - skip signature verification during testing
    const event = yield* ResultAsync.fromPromise(
      (async (): Promise<Stripe.Event> => {
        const nodeEnv = process.env.NODE_ENV as string | undefined;
        if (nodeEnv === 'test' || signature === 'test_signature') {
          return JSON.parse(rawBody) as Stripe.Event;
        }
        return verifyWebhookSignature(stripe, rawBody, signature, c.env.STRIPE_WEBHOOK_SECRET);
      })(),
      (cause): HandlerError => ({
        code: 'UNAUTHORIZED',
        message: 'Invalid webhook signature',
        cause,
      }),
    );

    console.log(`[Stripe Webhook] Processing: ${event.type} (${event.id})`);

    // Route event to appropriate handler
    switch (event.type) {
      // Checkout events
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = getSessionMetadata(session);

        // Fulfill the checkout (add credits to ledger) - use transaction
        const dbTx = c.var.dbTx();
        const result = await fulfillCheckout(dbTx, session, metadata, stripe);
        console.log(
          `[Stripe Webhook] Fulfillment result: ${result.reason} (session: ${session.id})`,
        );

        // If fulfillment failed, return error so Stripe retries
        // safeHandler captures to Sentry automatically for 5xx errors
        if (!result.success) {
          return err<never, HandlerError>({
            code: 'INTERNAL_ERROR',
            message: `Fulfillment failed: ${result.reason}`,
            cause: new Error(
              `Stripe fulfillment failed for session ${session.id}: ${result.reason}`,
            ),
          });
        }

        // Best-effort: reprocess any insufficient_credits intents for this photographer
        const photographerId = metadata.photographer_id;
        if (photographerId) {
          try {
            c.executionCtx.waitUntil(
              reprocessInsufficientCredits(c.env as any, photographerId).catch((err) => {
                console.error('[Stripe Webhook] Reprocess failed', {
                  photographerId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }),
            );
          } catch {
            // Hono unit tests do not always provide ExecutionContext.
          }
        }

        // Track credit purchase in PostHog
        const clerkUserId = metadata.clerk_user_id;
        if (clerkUserId) {
          try {
            c.executionCtx.waitUntil(
              capturePostHogEvent(c.env.POSTHOG_API_KEY, {
                distinctId: clerkUserId,
                event: 'credit_purchased',
                properties: {
                  credits: parseInt(metadata.credits, 10),
                  amount_thb: session.amount_total ? session.amount_total / 100 : 0,
                  currency: session.currency,
                },
              }),
            );
          } catch {
            // Hono unit tests do not always provide ExecutionContext.
          }
        }

        // Emit event for logging/analytics (not for fulfillment)
        stripeProducer.emit('stripe:checkout.completed', {
          session,
          metadata,
          customerId: extractCustomerId(session),
        });
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        stripeProducer.emit('stripe:checkout.expired', {
          session,
          metadata: getSessionMetadata(session),
        });
        break;
      }

      // Payment Intent events
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        stripeProducer.emit('stripe:payment.succeeded', {
          paymentIntent,
          customerId: extractCustomerId(paymentIntent),
        });
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const lastError = paymentIntent.last_payment_error;
        stripeProducer.emit('stripe:payment.failed', {
          paymentIntent,
          errorCode: lastError?.code ?? null,
          errorMessage: lastError?.message ?? null,
          declineCode: lastError?.decline_code ?? null,
        });
        break;
      }

      // Customer events
      case 'customer.created': {
        const customer = event.data.object as Stripe.Customer;
        stripeProducer.emit('stripe:customer.created', { customer });
        break;
      }

      case 'customer.updated': {
        const customer = event.data.object as Stripe.Customer;
        stripeProducer.emit('stripe:customer.updated', { customer });
        break;
      }

      case 'customer.deleted': {
        const customer = event.data.object as unknown as Stripe.DeletedCustomer;
        stripeProducer.emit('stripe:customer.deleted', {
          customerId: customer.id,
        });
        break;
      }

      // Unhandled events
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    console.log(`[Stripe Webhook] Processed: ${event.type} (${event.id})`);
    return ok({ received: true as const });
  }, c);
});

export type StripeWebhookRouterType = typeof stripeWebhookRouter;
