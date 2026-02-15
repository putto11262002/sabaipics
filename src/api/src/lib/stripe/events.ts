/**
 * Stripe Event Definitions
 *
 * Defines all Stripe webhook events that are emitted to the event bus.
 * Each event follows the discriminated union pattern with a `type` discriminator.
 *
 * ## Event Naming Convention
 *
 * Events use the format: `stripe:{category}.{action}`
 * - `stripe:checkout.completed` - Checkout session completed
 * - `stripe:payment.failed` - Payment intent failed
 * - `stripe:customer.created` - Customer created
 *
 * ## Usage
 *
 * ### As Producer (in webhook handler)
 * ```typescript
 * import { eventBus } from "../../events";
 * import type { StripeEvents } from "./events";
 *
 * const producer = eventBus.producer<StripeEvents>();
 * producer.emit("stripe:checkout.completed", { session, metadata, customerId });
 * ```
 *
 * ### As Consumer (in handler module)
 * ```typescript
 * import { eventBus } from "../../events";
 * import type { StripeEvents } from "../lib/stripe/events";
 *
 * eventBus.handle<StripeEvents>({
 *   "stripe:checkout.completed": async (event) => {
 *     // Handle checkout completion
 *   },
 * });
 * ```
 */

import type Stripe from "stripe";

/**
 * Stripe webhook events emitted to the event bus.
 *
 * This is a discriminated union type where the `type` field acts as the discriminator.
 * TypeScript will narrow the type based on the `type` field value.
 */
export type StripeEvents =
  | {
      type: "stripe:checkout.completed";
      /** The completed checkout session */
      session: Stripe.Checkout.Session;
      /** Extracted metadata from the session */
      metadata: Record<string, string>;
      /** Customer ID if available */
      customerId: string | null;
    }
  | {
      type: "stripe:checkout.expired";
      /** The expired checkout session */
      session: Stripe.Checkout.Session;
      /** Extracted metadata from the session */
      metadata: Record<string, string>;
    }
  | {
      type: "stripe:payment.succeeded";
      /** The successful payment intent */
      paymentIntent: Stripe.PaymentIntent;
      /** Customer ID if available */
      customerId: string | null;
    }
  | {
      type: "stripe:payment.failed";
      /** The failed payment intent */
      paymentIntent: Stripe.PaymentIntent;
      /** Error code from Stripe */
      errorCode: string | null;
      /** Human-readable error message */
      errorMessage: string | null;
      /** Decline code if the card was declined */
      declineCode: string | null;
    }
  | {
      type: "stripe:customer.created";
      /** The newly created customer */
      customer: Stripe.Customer;
    }
  | {
      type: "stripe:customer.updated";
      /** The updated customer */
      customer: Stripe.Customer;
    }
  | {
      type: "stripe:customer.deleted";
      /** ID of the deleted customer */
      customerId: string;
    };

/**
 * Extract the payload type for a specific event type.
 *
 * @example
 * ```typescript
 * type CheckoutPayload = StripeEventPayload<"stripe:checkout.completed">;
 * // { session: Stripe.Checkout.Session; metadata: Record<string, string>; customerId: string | null }
 * ```
 */
export type StripeEventPayload<T extends StripeEvents["type"]> = Omit<
  Extract<StripeEvents, { type: T }>,
  "type"
>;
