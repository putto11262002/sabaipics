/**
 * Global EventBus module - Central pub/sub system for the application.
 *
 * This module provides access to the singleton EventBus instance. The EventBus
 * is a generic, type-safe publish/subscribe system that enables decoupled
 * communication between different parts of the application.
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     Global EventBus                             │
 * │         (Generic - knows nothing about event shapes)            │
 * └─────────────────────────────────────────────────────────────────┘
 *                    ▲                         │
 *                    │ publish                 │ deliver
 *                    │                         ▼
 * ┌──────────────────┴───────┐    ┌───────────────────────────────┐
 * │       Producers          │    │         Consumers             │
 * │  (Define & emit events)  │    │  (Subscribe & handle events)  │
 * └──────────────────────────┘    └───────────────────────────────┘
 * ```
 *
 * ## Usage
 *
 * ### 1. Define Events (in your module)
 *
 * ```typescript
 * // src/lib/stripe/events.ts
 * export type StripeEvents =
 *   | { type: "stripe:checkout.completed"; session: Session }
 *   | { type: "stripe:payment.failed"; error: string };
 * ```
 *
 * ### 2. Publish Events (producer)
 *
 * ```typescript
 * import { eventBus } from "../../events";
 * import type { StripeEvents } from "./events";
 *
 * const producer = eventBus.producer<StripeEvents>();
 * producer.emit("stripe:checkout.completed", { session });
 * ```
 *
 * ### 3. Subscribe to Events (consumer)
 *
 * ```typescript
 * import { eventBus } from "../../events";
 * import type { StripeEvents } from "../lib/stripe/events";
 *
 * export function registerStripeHandlers() {
 *   return eventBus.handle<StripeEvents>({
 *     "stripe:checkout.completed": (event) => {
 *       console.log(`Checkout: ${event.session.id}`);
 *     },
 *   });
 * }
 * ```
 *
 * @module
 */

import { createEventBus, type EventBus as EventBusInterface } from './event-bus';

export const eventBus = createEventBus();

// Re-export types for convenience
export { createEventBus } from './event-bus';
export type { AnyEvent, EventHandlers, EventProducer, FilterFn } from './event-bus';
export type { EventBusInterface as EventBusType };
