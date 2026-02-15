/**
 * Stripe Event Handlers
 *
 * Registers handlers for Stripe webhook events emitted to the event bus.
 * Each handler processes a specific event type and performs business logic.
 *
 * ## Handler Responsibilities
 *
 * - `stripe:checkout.completed`: Add credits to photographer's account
 * - `stripe:checkout.expired`: Analytics for abandoned checkouts
 * - `stripe:payment.succeeded`: Confirmation logging
 * - `stripe:payment.failed`: Error tracking and alerting
 * - `stripe:customer.*`: Customer lifecycle management
 *
 * ## Usage
 *
 * Call `registerStripeHandlers()` once at application startup:
 *
 * ```typescript
 * import { registerStripeHandlers } from "./handlers/stripe";
 *
 * // At startup
 * registerStripeHandlers();
 * ```
 */

import { eventBus } from "../events";
import type { StripeEvents } from "../lib/stripe/events";

/**
 * Register all Stripe event handlers.
 *
 * This function subscribes to all Stripe events and registers appropriate
 * handlers for each. Handlers are currently "shell" implementations that
 * log events - actual business logic will be added when the database
 * schema is ready.
 *
 * @returns Unsubscribe function to remove all handlers
 */
export function registerStripeHandlers(): () => void {
  return eventBus.handle<StripeEvents>({
    /**
     * Handle checkout.session.completed
     *
     * Called when a customer successfully completes checkout.
     * This is the primary event for fulfillment.
     *
     * TODO: Add credit addition logic when payments table is ready
     */
    "stripe:checkout.completed": async (event) => {
      console.log("========== CHECKOUT COMPLETED ==========");
      console.log("Session ID:", event.session.id);
      console.log("Customer ID:", event.customerId);
      console.log("Payment Status:", event.session.payment_status);
      console.log("Amount Total:", event.session.amount_total);
      console.log("Currency:", event.session.currency);
      console.log("Metadata:", JSON.stringify(event.metadata, null, 2));
      console.log("=========================================");

      // TODO: When database is ready:
      // 1. Create payment record
      // 2. Add credits to photographer's ledger
      // 3. Update photographer's stripe_customer_id if not set
      //
      // const photographerId = event.metadata.photographer_id;
      // const credits = parseInt(event.metadata.credits ?? '0', 10);
      // await db.insert(payments).values({...});
      // await db.insert(credit_ledger).values({...});
    },

    /**
     * Handle checkout.session.expired
     *
     * Called when a checkout session expires without payment.
     * Useful for analytics and abandoned cart recovery.
     */
    "stripe:checkout.expired": async (event) => {
      console.log("========== CHECKOUT EXPIRED ==========");
      console.log("Session ID:", event.session.id);
      console.log("Metadata:", JSON.stringify(event.metadata, null, 2));
      console.log("======================================");

      // TODO: Analytics for abandoned checkouts
    },

    /**
     * Handle payment_intent.succeeded
     *
     * Called when a payment is confirmed.
     * For Checkout, this fires AFTER checkout.session.completed.
     */
    "stripe:payment.succeeded": async (event) => {
      console.log("========== PAYMENT SUCCEEDED ==========");
      console.log("Payment Intent ID:", event.paymentIntent.id);
      console.log("Amount:", event.paymentIntent.amount);
      console.log("Currency:", event.paymentIntent.currency);
      console.log("Customer:", event.customerId);
      console.log("=======================================");

      // For Checkout flow, fulfillment is handled in checkout.session.completed
      // This event is useful for:
      // - Confirmation/logging
      // - Direct PaymentIntent flows (not using Checkout)
    },

    /**
     * Handle payment_intent.payment_failed
     *
     * Called when a payment fails.
     */
    "stripe:payment.failed": async (event) => {
      console.log("========== PAYMENT FAILED ==========");
      console.log("Payment Intent ID:", event.paymentIntent.id);
      console.log("Amount:", event.paymentIntent.amount);
      console.log("Error Code:", event.errorCode);
      console.log("Error Message:", event.errorMessage);
      console.log("Decline Code:", event.declineCode);
      console.log("====================================");

      // TODO: Alert monitoring, customer notification
    },

    /**
     * Handle customer.created
     *
     * Called when a new Stripe customer is created.
     */
    "stripe:customer.created": async (event) => {
      console.log("========== CUSTOMER CREATED ==========");
      console.log("Customer ID:", event.customer.id);
      console.log("Email:", event.customer.email);
      console.log("Name:", event.customer.name);
      console.log("Metadata:", JSON.stringify(event.customer.metadata, null, 2));
      console.log("======================================");

      // Customers are created via our API, so this is mostly for logging
    },

    /**
     * Handle customer.updated
     *
     * Called when a Stripe customer is updated.
     */
    "stripe:customer.updated": async (event) => {
      console.log("========== CUSTOMER UPDATED ==========");
      console.log("Customer ID:", event.customer.id);
      console.log("Email:", event.customer.email);
      console.log("Name:", event.customer.name);
      console.log("======================================");

      // TODO: Sync changes back to photographer record if needed
    },

    /**
     * Handle customer.deleted
     *
     * Called when a Stripe customer is deleted.
     */
    "stripe:customer.deleted": async (event) => {
      console.log("========== CUSTOMER DELETED ==========");
      console.log("Customer ID:", event.customerId);
      console.log("======================================");

      // TODO: Handle customer deletion (clear stripe_customer_id from photographer)
    },
  });
}
