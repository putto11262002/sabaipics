/**
 * EventBus - A generic, type-safe publish/subscribe event system.
 *
 * The EventBus itself is completely generic and has no knowledge of specific event types.
 * Type safety is achieved through TypeScript generics at the producer and consumer level.
 *
 * ## Design Philosophy
 *
 * - **Decoupled**: The bus doesn't import or know about any event type definitions
 * - **Type-safe**: Producers and consumers get full type checking via generics
 * - **Modular**: Each module defines its own event types in `module/events.ts`
 *
 * ## Usage
 *
 * ### Defining Events (in your module)
 * ```typescript
 * // src/lib/stripe/events.ts
 * export type StripeEvents =
 *   | { type: "stripe:checkout.completed"; session: Session }
 *   | { type: "stripe:payment.failed"; error: string };
 * ```
 *
 * ### Publishing Events
 * ```typescript
 * import { eventBus } from "@/events";
 * import type { StripeEvents } from "./events";
 *
 * const producer = eventBus.producer<StripeEvents>();
 * producer.emit("stripe:checkout.completed", { session });
 * ```
 *
 * ### Consuming Events
 * ```typescript
 * import { eventBus } from "@/events";
 * import type { StripeEvents } from "@/lib/stripe/events";
 *
 * eventBus.handle<StripeEvents>({
 *   "stripe:checkout.completed": (event) => {
 *     console.log(`Checkout completed: ${event.session.id}`);
 *   },
 * });
 * ```
 *
 * @module
 */

/**
 * Base event shape - all events must have a `type` discriminator.
 * The EventBus routes events based on this `type` field.
 */
export type AnyEvent = { type: string; [key: string]: unknown };

/**
 * A type-safe event producer for a specific group of events.
 *
 * Producers are created via `eventBus.producer<MyEventTypes>()` and provide
 * compile-time type checking for the `emit` method.
 *
 * @typeParam E - Union type of all events this producer can emit
 */
export interface EventProducer<E extends AnyEvent> {
  /**
   * Emit an event to all registered handlers.
   *
   * @param type - The event type (discriminator)
   * @param payload - The event payload (type is inferred and enforced)
   */
  emit<T extends E['type']>(type: T, payload: Omit<Extract<E, { type: T }>, 'type'>): void;
}

/**
 * Handler map for subscribing to a group of events.
 *
 * Each key is an event type, and the value is a handler function
 * that receives the full event object (including `type`).
 *
 * @typeParam E - Union type of all events that can be handled
 */
export type EventHandlers<E extends AnyEvent> = {
  [K in E['type']]?: (event: Extract<E, { type: K }>) => void | Promise<void>;
};

/**
 * Filter predicate for filtered subscriptions.
 *
 * Return `true` to receive the event, `false` to skip it.
 *
 * @typeParam E - The event type being filtered
 */
export type FilterFn<E extends AnyEvent> = (event: E) => boolean;

/**
 * The EventBus interface - a generic publish/subscribe system.
 *
 * The EventBus is the central message routing system. It maintains no knowledge
 * of specific event types - all type safety comes from the generic parameters
 * provided by producers and consumers.
 */
export interface EventBus {
  /**
   * Create a type-safe producer for a group of events.
   *
   * @typeParam E - Union type of events this producer can emit
   * @returns A producer instance bound to the event bus
   */
  producer<E extends AnyEvent>(): EventProducer<E>;

  /**
   * Subscribe to events with type-safe handlers.
   *
   * @typeParam E - Union type of events to handle
   * @param handlers - Map of event type to handler function
   * @returns Unsubscribe function - call to remove all handlers
   */
  handle<E extends AnyEvent>(handlers: EventHandlers<E>): () => void;

  /**
   * Subscribe with a filter predicate.
   *
   * @typeParam E - Union type of events to handle
   * @param filter - Predicate function to filter events
   * @param handlers - Map of event type to handler function
   * @returns Unsubscribe function
   */
  handleFiltered<E extends AnyEvent>(filter: FilterFn<E>, handlers: EventHandlers<E>): () => void;
}

/**
 * Internal handler type for the event bus implementation.
 * @internal
 */
type Handler = (event: AnyEvent) => void | Promise<void>;

/**
 * Internal filtered handler entry.
 * @internal
 */
type FilteredHandlerEntry = {
  filter: FilterFn<AnyEvent>;
  handler: Handler;
};

/**
 * Create a new EventBus instance.
 *
 * @returns A new EventBus instance
 */
export function createEventBus(): EventBus {
  /**
   * Map of event type -> set of handlers.
   * Direct handlers are invoked for exact type matches.
   */
  const handlers = new Map<string, Set<Handler>>();

  /**
   * Set of filtered handlers.
   * These are checked against all events and only invoked if filter passes.
   */
  const filteredHandlers = new Set<FilteredHandlerEntry>();

  /**
   * Dispatch an event to all matching handlers.
   *
   * Handler errors are caught and logged to prevent one failing handler
   * from affecting others. Async handlers run concurrently (not awaited).
   */
  const dispatch = (event: AnyEvent): void => {
    // Invoke direct handlers for this event type
    const typeHandlers = handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          // Fire and forget - don't await async handlers
          const result = handler(event);
          // Catch async errors
          if (result instanceof Promise) {
            result.catch((error) => {
              console.error(`[EventBus] Async handler error for "${event.type}":`, error);
            });
          }
        } catch (error) {
          console.error(`[EventBus] Handler error for "${event.type}":`, error);
        }
      }
    }

    // Invoke filtered handlers where filter passes
    for (const entry of filteredHandlers) {
      try {
        if (entry.filter(event)) {
          const result = entry.handler(event);
          if (result instanceof Promise) {
            result.catch((error) => {
              console.error(`[EventBus] Async filtered handler error for "${event.type}":`, error);
            });
          }
        }
      } catch (error) {
        console.error(`[EventBus] Filtered handler error for "${event.type}":`, error);
      }
    }
  };

  return {
    producer<E extends AnyEvent>(): EventProducer<E> {
      return {
        emit(type, payload) {
          const event = { type, ...payload } as unknown as AnyEvent;
          dispatch(event);
        },
      };
    },

    handle<E extends AnyEvent>(eventHandlers: EventHandlers<E>): () => void {
      const unsubscribers: (() => void)[] = [];

      for (const [type, handler] of Object.entries(eventHandlers)) {
        if (!handler) continue;

        // Ensure handler set exists for this type
        if (!handlers.has(type)) {
          handlers.set(type, new Set());
        }

        const typedHandler = handler as Handler;
        handlers.get(type)!.add(typedHandler);

        // Create unsubscriber for this specific handler
        unsubscribers.push(() => {
          handlers.get(type)?.delete(typedHandler);
          // Clean up empty sets
          if (handlers.get(type)?.size === 0) {
            handlers.delete(type);
          }
        });
      }

      // Return combined unsubscribe function
      return () => {
        for (const unsub of unsubscribers) {
          unsub();
        }
      };
    },

    handleFiltered<E extends AnyEvent>(
      filter: FilterFn<E>,
      eventHandlers: EventHandlers<E>,
    ): () => void {
      const entries: FilteredHandlerEntry[] = [];

      for (const [type, handler] of Object.entries(eventHandlers)) {
        if (!handler) continue;

        // Create a combined filter that checks both type and user filter
        const entry: FilteredHandlerEntry = {
          filter: (event) => event.type === type && (filter as FilterFn<AnyEvent>)(event),
          handler: handler as Handler,
        };

        entries.push(entry);
        filteredHandlers.add(entry);
      }

      // Return unsubscribe function
      return () => {
        for (const entry of entries) {
          filteredHandlers.delete(entry);
        }
      };
    },
  };
}
