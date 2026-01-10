/**
 * Stripe Client & Error Handling Tests
 *
 * Runs in Node.js with mocks.
 * Tests error classification, backoff logic, webhook handling, and utilities.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";
import {
  isRetryableError,
  isRateLimitError,
  isCardError,
  isAuthenticationError,
  isInvalidRequestError,
  getBackoffDelay,
  formatStripeError,
  getCardErrorMessage,
} from "../src/lib/stripe/errors";
import {
  handleWebhookEvent,
  getSessionMetadata,
  extractCustomerId,
  type WebhookHandlers,
} from "../src/lib/stripe/webhook";
import {
  createCheckoutCompletedEvent,
  createCheckoutExpiredEvent,
  createPaymentSucceededEvent,
  createPaymentFailedEvent,
  createCustomerCreatedEvent,
  createCustomerUpdatedEvent,
  createCustomerDeletedEvent,
  MOCK_IDS,
  TEST_WEBHOOK_SECRET,
  createRawEventPayload,
} from "./fixtures/stripe-events";
import { fulfillCheckout } from "../src/routes/webhooks/stripe";

// =============================================================================
// Error Classification Tests
// =============================================================================

describe("Error Classification", () => {
  describe("isRetryableError", () => {
    it("identifies rate limit errors as retryable", () => {
      const error = new Stripe.errors.StripeRateLimitError({
        message: "Rate limit exceeded",
      });
      expect(isRetryableError(error)).toBe(true);
    });

    it("identifies connection errors as retryable", () => {
      const error = new Stripe.errors.StripeConnectionError({
        message: "Connection failed",
      });
      expect(isRetryableError(error)).toBe(true);
    });

    it("identifies API errors as retryable", () => {
      const error = new Stripe.errors.StripeAPIError({
        message: "API error",
      });
      expect(isRetryableError(error)).toBe(true);
    });

    it("does not identify card errors as retryable", () => {
      const error = new Stripe.errors.StripeCardError({
        message: "Card declined",
        type: "card_error",
      });
      expect(isRetryableError(error)).toBe(false);
    });

    it("does not identify authentication errors as retryable", () => {
      const error = new Stripe.errors.StripeAuthenticationError({
        message: "Invalid API key",
      });
      expect(isRetryableError(error)).toBe(false);
    });

    it("handles non-Stripe errors", () => {
      const error = new Error("Generic error");
      expect(isRetryableError(error)).toBe(false);
    });

    it("handles null/undefined", () => {
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });

  describe("isRateLimitError", () => {
    it("identifies rate limit errors", () => {
      const error = new Stripe.errors.StripeRateLimitError({
        message: "Too many requests",
      });
      expect(isRateLimitError(error)).toBe(true);
    });

    it("returns false for other errors", () => {
      const error = new Stripe.errors.StripeCardError({
        message: "Card error",
        type: "card_error",
      });
      expect(isRateLimitError(error)).toBe(false);
    });
  });

  describe("isCardError", () => {
    it("identifies card errors", () => {
      const error = new Stripe.errors.StripeCardError({
        message: "Insufficient funds",
        type: "card_error",
      });
      expect(isCardError(error)).toBe(true);
    });

    it("returns false for other errors", () => {
      const error = new Stripe.errors.StripeAPIError({
        message: "API error",
      });
      expect(isCardError(error)).toBe(false);
    });
  });

  describe("isAuthenticationError", () => {
    it("identifies authentication errors", () => {
      const error = new Stripe.errors.StripeAuthenticationError({
        message: "Invalid key",
      });
      expect(isAuthenticationError(error)).toBe(true);
    });
  });

  describe("isInvalidRequestError", () => {
    it("identifies invalid request errors", () => {
      const error = new Stripe.errors.StripeInvalidRequestError({
        message: "Invalid parameter",
        type: "invalid_request_error",
      });
      expect(isInvalidRequestError(error)).toBe(true);
    });
  });
});

// =============================================================================
// Backoff Calculation Tests
// =============================================================================

describe("Backoff Calculation", () => {
  it("calculates exponential backoff with base delay", () => {
    const delay1 = getBackoffDelay(1);
    const delay2 = getBackoffDelay(2);
    const delay3 = getBackoffDelay(3);

    // Base is 1000ms with 0-1000ms jitter
    // Attempt 1: 1000 + jitter = 1000-2000ms
    expect(delay1).toBeGreaterThanOrEqual(1000);
    expect(delay1).toBeLessThanOrEqual(2000);

    // Attempt 2: 2000 + jitter = 2000-3000ms
    expect(delay2).toBeGreaterThanOrEqual(2000);
    expect(delay2).toBeLessThanOrEqual(3000);

    // Attempt 3: 4000 + jitter = 4000-5000ms
    expect(delay3).toBeGreaterThanOrEqual(4000);
    expect(delay3).toBeLessThanOrEqual(5000);
  });

  it("caps at maximum delay", () => {
    // Very high attempt number should cap at 30s
    const delay = getBackoffDelay(100);
    expect(delay).toBeLessThanOrEqual(45000); // 30s + 50% jitter
  });

  it("handles zero/negative attempts", () => {
    const delay0 = getBackoffDelay(0);
    const delayNeg = getBackoffDelay(-1);

    // Should still return some reasonable delay
    expect(delay0).toBeGreaterThanOrEqual(0);
    expect(delayNeg).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Error Formatting Tests
// =============================================================================

describe("Error Formatting", () => {
  describe("formatStripeError", () => {
    it("formats card errors with decline code", () => {
      const error = new Stripe.errors.StripeCardError({
        message: "Your card was declined",
        type: "card_error",
        code: "card_declined",
      });
      (error as unknown as { decline_code: string }).decline_code =
        "insufficient_funds";

      const formatted = formatStripeError(error);

      // Stripe SDK returns the passed type, not class name
      expect(formatted.type).toBe("card_error");
      expect(formatted.code).toBe("card_declined");
      expect(formatted.message).toContain("declined");
      expect(formatted.retryable).toBe(false);
      expect(formatted.declineCode).toBe("insufficient_funds");
    });

    it("formats rate limit errors as retryable", () => {
      const error = new Stripe.errors.StripeRateLimitError({
        message: "Too many requests",
      });

      const formatted = formatStripeError(error);

      // Rate limit errors have type property from SDK
      expect(formatted.type).toBe("rate_limit_error");
      expect(formatted.message).toBe("Too many requests");
      expect(formatted.retryable).toBe(true);
    });

    it("handles non-Stripe errors", () => {
      const error = new Error("Something went wrong");

      const formatted = formatStripeError(error);

      expect(formatted.type).toBe("unknown");
      expect(formatted.message).toBe("Something went wrong");
      expect(formatted.retryable).toBe(false);
    });
  });

  describe("getCardErrorMessage", () => {
    it("returns user-friendly message for card_declined", () => {
      const error = new Stripe.errors.StripeCardError({
        message: "Technical message",
        type: "card_error",
        code: "card_declined",
      });
      // The decline_code is what maps to user-friendly messages
      (error as unknown as { decline_code: string }).decline_code =
        "card_declined";

      const message = getCardErrorMessage(error);
      expect(message).toContain("declined");
    });

    it("returns user-friendly message for expired_card", () => {
      const error = new Stripe.errors.StripeCardError({
        message: "Technical message",
        type: "card_error",
        code: "expired_card",
      });
      // The decline_code is what maps to user-friendly messages
      (error as unknown as { decline_code: string }).decline_code =
        "expired_card";

      const message = getCardErrorMessage(error);
      expect(message).toContain("expired");
    });

    it("falls back to Stripe message for unknown codes", () => {
      const error = new Stripe.errors.StripeCardError({
        message: "Some specific Stripe error message",
        type: "card_error",
        code: "some_unknown_code",
      });
      // No decline_code set, so should fall back to error.message

      const message = getCardErrorMessage(error);
      expect(message).toBe("Some specific Stripe error message");
    });
  });
});

// =============================================================================
// Webhook Event Routing Tests
// =============================================================================

describe("Webhook Event Routing", () => {
  let handlers: WebhookHandlers;
  let mockCheckoutComplete: ReturnType<typeof vi.fn>;
  let mockCheckoutExpired: ReturnType<typeof vi.fn>;
  let mockPaymentSuccess: ReturnType<typeof vi.fn>;
  let mockPaymentFailed: ReturnType<typeof vi.fn>;
  let mockCustomerCreated: ReturnType<typeof vi.fn>;
  let mockCustomerUpdated: ReturnType<typeof vi.fn>;
  let mockCustomerDeleted: ReturnType<typeof vi.fn>;
  let mockUnhandled: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCheckoutComplete = vi.fn().mockResolvedValue(undefined);
    mockCheckoutExpired = vi.fn().mockResolvedValue(undefined);
    mockPaymentSuccess = vi.fn().mockResolvedValue(undefined);
    mockPaymentFailed = vi.fn().mockResolvedValue(undefined);
    mockCustomerCreated = vi.fn().mockResolvedValue(undefined);
    mockCustomerUpdated = vi.fn().mockResolvedValue(undefined);
    mockCustomerDeleted = vi.fn().mockResolvedValue(undefined);
    mockUnhandled = vi.fn().mockResolvedValue(undefined);

    handlers = {
      onCheckoutComplete: mockCheckoutComplete,
      onCheckoutExpired: mockCheckoutExpired,
      onPaymentSuccess: mockPaymentSuccess,
      onPaymentFailed: mockPaymentFailed,
      onCustomerCreated: mockCustomerCreated,
      onCustomerUpdated: mockCustomerUpdated,
      onCustomerDeleted: mockCustomerDeleted,
      onUnhandledEvent: mockUnhandled,
    };
  });

  it("routes checkout.session.completed to onCheckoutComplete", async () => {
    const event = createCheckoutCompletedEvent();

    const result = await handleWebhookEvent(event, handlers);

    expect(result.success).toBe(true);
    expect(result.eventType).toBe("checkout.session.completed");
    expect(mockCheckoutComplete).toHaveBeenCalledOnce();
    expect(mockCheckoutComplete).toHaveBeenCalledWith(event.data.object);
  });

  it("routes checkout.session.expired to onCheckoutExpired", async () => {
    const event = createCheckoutExpiredEvent();

    const result = await handleWebhookEvent(event, handlers);

    expect(result.success).toBe(true);
    expect(result.eventType).toBe("checkout.session.expired");
    expect(mockCheckoutExpired).toHaveBeenCalledOnce();
  });

  it("routes payment_intent.succeeded to onPaymentSuccess", async () => {
    const event = createPaymentSucceededEvent();

    const result = await handleWebhookEvent(event, handlers);

    expect(result.success).toBe(true);
    expect(result.eventType).toBe("payment_intent.succeeded");
    expect(mockPaymentSuccess).toHaveBeenCalledOnce();
  });

  it("routes payment_intent.payment_failed to onPaymentFailed", async () => {
    const event = createPaymentFailedEvent();

    const result = await handleWebhookEvent(event, handlers);

    expect(result.success).toBe(true);
    expect(result.eventType).toBe("payment_intent.payment_failed");
    expect(mockPaymentFailed).toHaveBeenCalledOnce();
  });

  it("routes customer.created to onCustomerCreated", async () => {
    const event = createCustomerCreatedEvent();

    const result = await handleWebhookEvent(event, handlers);

    expect(result.success).toBe(true);
    expect(result.eventType).toBe("customer.created");
    expect(mockCustomerCreated).toHaveBeenCalledOnce();
  });

  it("routes customer.updated to onCustomerUpdated", async () => {
    const event = createCustomerUpdatedEvent();

    const result = await handleWebhookEvent(event, handlers);

    expect(result.success).toBe(true);
    expect(result.eventType).toBe("customer.updated");
    expect(mockCustomerUpdated).toHaveBeenCalledOnce();
  });

  it("routes customer.deleted to onCustomerDeleted", async () => {
    const event = createCustomerDeletedEvent();

    const result = await handleWebhookEvent(event, handlers);

    expect(result.success).toBe(true);
    expect(result.eventType).toBe("customer.deleted");
    expect(mockCustomerDeleted).toHaveBeenCalledOnce();
  });

  it("calls onUnhandledEvent for unknown event types", async () => {
    const event = createCheckoutCompletedEvent();
    (event as { type: string }).type = "some.unknown.event";

    const result = await handleWebhookEvent(event, handlers);

    expect(result.success).toBe(true);
    expect(mockUnhandled).toHaveBeenCalledOnce();
  });

  it("handles missing handlers gracefully", async () => {
    const event = createCheckoutCompletedEvent();
    const emptyHandlers: WebhookHandlers = {};

    const result = await handleWebhookEvent(event, emptyHandlers);

    expect(result.success).toBe(true);
  });

  it("returns error result when handler throws", async () => {
    const event = createCheckoutCompletedEvent();
    const errorHandlers: WebhookHandlers = {
      onCheckoutComplete: vi.fn().mockRejectedValue(new Error("Handler error")),
    };

    const result = await handleWebhookEvent(event, errorHandlers);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Handler error");
    expect(result.eventType).toBe("checkout.session.completed");
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe("Utility Functions", () => {
  describe("getSessionMetadata", () => {
    it("extracts metadata from session", () => {
      const event = createCheckoutCompletedEvent();
      const session = event.data.object as Stripe.Checkout.Session;

      const metadata = getSessionMetadata(session);

      expect(metadata.photographer_id).toBe(MOCK_IDS.photographer);
      expect(metadata.credits).toBe("100");
      expect(metadata.package_name).toBe("starter");
    });

    it("returns empty object when no metadata", () => {
      const event = createCheckoutCompletedEvent({ metadata: {} });
      const session = event.data.object as Stripe.Checkout.Session;

      const metadata = getSessionMetadata(session);

      expect(metadata).toEqual({});
    });
  });

  describe("extractCustomerId", () => {
    it("extracts string customer ID from checkout session", () => {
      const event = createCheckoutCompletedEvent();
      const session = event.data.object as Stripe.Checkout.Session;

      const customerId = extractCustomerId(session);

      expect(customerId).toBe(MOCK_IDS.customer);
    });

    it("extracts customer ID from payment intent", () => {
      const event = createPaymentSucceededEvent();
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      const customerId = extractCustomerId(paymentIntent);

      expect(customerId).toBe(MOCK_IDS.customer);
    });

    it("returns null when no customer", () => {
      const event = createCheckoutCompletedEvent({ customer: null });
      const session = event.data.object as Stripe.Checkout.Session;

      const customerId = extractCustomerId(session);

      expect(customerId).toBeNull();
    });
  });
});

// =============================================================================
// Webhook Signature Tests
// =============================================================================

describe("Webhook Signature Verification", () => {
  it("generates test signature header", () => {
    const event = createCheckoutCompletedEvent();
    const payload = createRawEventPayload(event);
    const timestamp = Math.floor(Date.now() / 1000);

    // Use Stripe's built-in test header generator
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WEBHOOK_SECRET,
      timestamp,
    });

    expect(header).toContain("t=");
    expect(header).toContain("v1=");
  });

  it("verifies valid signature", async () => {
    const stripe = new Stripe("sk_test_fake", {
      apiVersion: "2025-11-17.clover",
    });

    const event = createCheckoutCompletedEvent();
    const payload = createRawEventPayload(event);
    const timestamp = Math.floor(Date.now() / 1000);

    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WEBHOOK_SECRET,
      timestamp,
    });

    // This uses synchronous verification (for Node.js)
    const constructedEvent = stripe.webhooks.constructEvent(
      payload,
      header,
      TEST_WEBHOOK_SECRET
    );

    expect(constructedEvent.type).toBe("checkout.session.completed");
    expect(constructedEvent.id).toBe(MOCK_IDS.event);
  });

  it("rejects invalid signature", () => {
    const stripe = new Stripe("sk_test_fake", {
      apiVersion: "2025-11-17.clover",
    });

    const event = createCheckoutCompletedEvent();
    const payload = createRawEventPayload(event);

    expect(() => {
      stripe.webhooks.constructEvent(
        payload,
        "invalid_signature",
        TEST_WEBHOOK_SECRET
      );
    }).toThrow();
  });

  it("rejects tampered payload", () => {
    const stripe = new Stripe("sk_test_fake", {
      apiVersion: "2025-11-17.clover",
    });

    const event = createCheckoutCompletedEvent();
    const payload = createRawEventPayload(event);
    const timestamp = Math.floor(Date.now() / 1000);

    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WEBHOOK_SECRET,
      timestamp,
    });

    // Tamper with payload
    const tamperedPayload = payload.replace(MOCK_IDS.event, "evt_tampered");

    expect(() => {
      stripe.webhooks.constructEvent(
        tamperedPayload,
        header,
        TEST_WEBHOOK_SECRET
      );
    }).toThrow();
  });
});

// =============================================================================
// Credit Fulfillment Tests
// =============================================================================

describe("Credit Fulfillment", () => {
  /**
   * Create a mock database for testing fulfillment
   */
  function createMockDb(options: {
    insertShouldFail?: boolean;
    insertError?: string;
  } = {}) {
    const insertedValues: unknown[] = [];

    return {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((values: unknown) => {
          if (options.insertShouldFail) {
            throw new Error(options.insertError ?? "DB error");
          }
          insertedValues.push(values);
          return Promise.resolve();
        }),
      }),
      // Expose for assertions
      _insertedValues: insertedValues,
    };
  }

  describe("fulfillCheckout", () => {
    it("adds credits for valid paid checkout", async () => {
      const mockDb = createMockDb();
      const event = createCheckoutCompletedEvent();
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = {
        photographer_id: MOCK_IDS.photographer,
        credits: "100",
        package_name: "starter",
      };

      const result = await fulfillCheckout(mockDb as never, session, metadata);

      expect(result.success).toBe(true);
      expect(result.reason).toBe("fulfilled");
      expect(mockDb.insert).toHaveBeenCalledOnce();
      expect(mockDb._insertedValues[0]).toMatchObject({
        photographerId: MOCK_IDS.photographer,
        amount: 100,
        type: "purchase",
        stripeSessionId: session.id,
      });
      // Check expiry is approximately 6 months in the future
      const inserted = mockDb._insertedValues[0] as { expiresAt: string };
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
      const insertedDate = new Date(inserted.expiresAt);
      const timeDiff = Math.abs(
        insertedDate.getTime() - sixMonthsFromNow.getTime()
      );
      expect(timeDiff).toBeLessThan(60000); // Within 1 minute
    });

    it("skips unpaid sessions", async () => {
      const mockDb = createMockDb();
      const event = createCheckoutCompletedEvent({ payment_status: "unpaid" });
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = {
        photographer_id: MOCK_IDS.photographer,
        credits: "100",
      };

      const result = await fulfillCheckout(mockDb as never, session, metadata);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("unpaid");
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("rejects missing photographer_id", async () => {
      const mockDb = createMockDb();
      const event = createCheckoutCompletedEvent();
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = {
        credits: "100",
        // missing photographer_id
      };

      const result = await fulfillCheckout(mockDb as never, session, metadata);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("missing_photographer_id");
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("rejects missing credits", async () => {
      const mockDb = createMockDb();
      const event = createCheckoutCompletedEvent();
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = {
        photographer_id: MOCK_IDS.photographer,
        // missing credits
      };

      const result = await fulfillCheckout(mockDb as never, session, metadata);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("missing_credits");
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("rejects invalid credits value", async () => {
      const mockDb = createMockDb();
      const event = createCheckoutCompletedEvent();
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = {
        photographer_id: MOCK_IDS.photographer,
        credits: "not-a-number",
      };

      const result = await fulfillCheckout(mockDb as never, session, metadata);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("invalid_credits");
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("rejects zero credits", async () => {
      const mockDb = createMockDb();
      const event = createCheckoutCompletedEvent();
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = {
        photographer_id: MOCK_IDS.photographer,
        credits: "0",
      };

      const result = await fulfillCheckout(mockDb as never, session, metadata);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("invalid_credits");
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("handles duplicate webhook (unique constraint violation)", async () => {
      const mockDb = createMockDb({
        insertShouldFail: true,
        insertError: "duplicate key value violates unique constraint",
      });
      const event = createCheckoutCompletedEvent();
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = {
        photographer_id: MOCK_IDS.photographer,
        credits: "100",
      };

      const result = await fulfillCheckout(mockDb as never, session, metadata);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("duplicate");
    });

    it("handles other DB errors", async () => {
      const mockDb = createMockDb({
        insertShouldFail: true,
        insertError: "Foreign key constraint violation",
      });
      const event = createCheckoutCompletedEvent();
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = {
        photographer_id: MOCK_IDS.photographer,
        credits: "100",
      };

      const result = await fulfillCheckout(mockDb as never, session, metadata);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("db_error");
    });
  });
});
