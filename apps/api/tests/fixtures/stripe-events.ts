/**
 * Stripe Test Fixtures
 *
 * Mock Stripe event payloads for testing webhook handlers.
 * Based on Stripe's actual event structures.
 */

import type Stripe from "stripe";

// =============================================================================
// Mock IDs
// =============================================================================

export const MOCK_IDS = {
  customer: "cus_test123456",
  session: "cs_test_session_123",
  paymentIntent: "pi_test_intent_123",
  photographer: "photo_test_123",
  event: "evt_test_event_123",
} as const;

// =============================================================================
// Checkout Session Events
// =============================================================================

/**
 * Creates a mock checkout.session.completed event
 */
export function createCheckoutCompletedEvent(
  overrides?: Partial<Stripe.Checkout.Session>
): Stripe.Event {
  const session: Stripe.Checkout.Session = {
    id: MOCK_IDS.session,
    object: "checkout.session",
    amount_subtotal: 29900,
    amount_total: 29900,
    currency: "thb",
    customer: MOCK_IDS.customer,
    customer_email: "test@example.com",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    success_url: "https://example.com/success",
    cancel_url: "https://example.com/cancel",
    metadata: {
      photographer_id: MOCK_IDS.photographer,
      credits: "100",
      package_name: "starter",
    },
    created: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    livemode: false,
    // Required fields with null/undefined defaults
    after_expiration: null,
    allow_promotion_codes: null,
    automatic_tax: { enabled: false, liability: null, status: null },
    billing_address_collection: null,
    client_reference_id: null,
    client_secret: null,
    consent: null,
    consent_collection: null,
    currency_conversion: null,
    custom_fields: [],
    custom_text: {
      after_submit: null,
      shipping_address: null,
      submit: null,
      terms_of_service_acceptance: null,
    },
    customer_creation: "if_required",
    customer_details: {
      address: null,
      email: "test@example.com",
      name: "Test User",
      phone: null,
      tax_exempt: "none",
      tax_ids: null,
    },
    invoice: null,
    invoice_creation: null,
    line_items: undefined,
    locale: null,
    payment_intent: MOCK_IDS.paymentIntent,
    payment_link: null,
    payment_method_collection: "if_required",
    payment_method_configuration_details: null,
    payment_method_options: null,
    payment_method_types: ["card"],
    phone_number_collection: { enabled: false },
    recovered_from: null,
    redirect_on_completion: "always",
    return_url: null,
    saved_payment_method_options: null,
    setup_intent: null,
    shipping_address_collection: null,
    shipping_cost: null,
    shipping_details: null,
    shipping_options: [],
    submit_type: null,
    subscription: null,
    tax_id_collection: { enabled: false, required: "never" },
    total_details: {
      amount_discount: 0,
      amount_shipping: 0,
      amount_tax: 0,
    },
    ui_mode: "hosted",
    url: null,
    ...overrides,
  };

  return {
    id: MOCK_IDS.event,
    object: "event",
    api_version: "2025-11-17.clover",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: session,
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: "req_test_123", idempotency_key: null },
    type: "checkout.session.completed",
  } as Stripe.Event;
}

/**
 * Creates a mock checkout.session.expired event
 */
export function createCheckoutExpiredEvent(
  overrides?: Partial<Stripe.Checkout.Session>
): Stripe.Event {
  const baseEvent = createCheckoutCompletedEvent({
    payment_status: "unpaid",
    status: "expired",
    ...overrides,
  });

  return {
    ...baseEvent,
    type: "checkout.session.expired",
  } as Stripe.Event;
}

// =============================================================================
// Payment Intent Events
// =============================================================================

/**
 * Creates a mock payment_intent.succeeded event
 */
export function createPaymentSucceededEvent(
  overrides?: Partial<Stripe.PaymentIntent>
): Stripe.Event {
  const paymentIntent: Stripe.PaymentIntent = {
    id: MOCK_IDS.paymentIntent,
    object: "payment_intent",
    amount: 29900,
    amount_capturable: 0,
    amount_received: 29900,
    currency: "thb",
    customer: MOCK_IDS.customer,
    status: "succeeded",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    metadata: {},
    // Required fields
    amount_details: { tip: {} },
    application: null,
    application_fee_amount: null,
    automatic_payment_methods: null,
    canceled_at: null,
    cancellation_reason: null,
    capture_method: "automatic_async",
    client_secret: "pi_test_secret",
    confirmation_method: "automatic",
    description: null,
    invoice: null,
    last_payment_error: null,
    latest_charge: "ch_test_123",
    next_action: null,
    on_behalf_of: null,
    payment_method: "pm_test_123",
    payment_method_configuration_details: null,
    payment_method_options: null,
    payment_method_types: ["card"],
    presentment_details: null,
    processing: null,
    receipt_email: null,
    review: null,
    setup_future_usage: null,
    shipping: null,
    source: null,
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    transfer_data: null,
    transfer_group: null,
    ...overrides,
  };

  return {
    id: MOCK_IDS.event,
    object: "event",
    api_version: "2025-11-17.clover",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: paymentIntent,
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: "req_test_123", idempotency_key: null },
    type: "payment_intent.succeeded",
  } as Stripe.Event;
}

/**
 * Creates a mock payment_intent.payment_failed event
 */
export function createPaymentFailedEvent(
  overrides?: Partial<Stripe.PaymentIntent>
): Stripe.Event {
  const baseEvent = createPaymentSucceededEvent({
    status: "requires_payment_method",
    amount_received: 0,
    last_payment_error: {
      code: "card_declined",
      decline_code: "generic_decline",
      message: "Your card was declined.",
      type: "card_error",
      charge: null,
      doc_url: null,
      param: null,
      payment_method: null,
      payment_method_type: null,
      request_log_url: null,
      setup_intent: null,
      source: null,
    },
    ...overrides,
  });

  return {
    ...baseEvent,
    type: "payment_intent.payment_failed",
  } as Stripe.Event;
}

// =============================================================================
// Customer Events
// =============================================================================

/**
 * Creates a mock customer.created event
 */
export function createCustomerCreatedEvent(
  overrides?: Partial<Stripe.Customer>
): Stripe.Event {
  const customer: Stripe.Customer = {
    id: MOCK_IDS.customer,
    object: "customer",
    email: "test@example.com",
    name: "Test Photographer",
    metadata: {
      photographer_id: MOCK_IDS.photographer,
      source: "sabaipics",
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    // Required fields
    address: null,
    balance: 0,
    currency: null,
    default_source: null,
    delinquent: false,
    description: null,
    discount: null,
    invoice_credit_balance: {},
    invoice_prefix: "TEST",
    invoice_settings: {
      custom_fields: null,
      default_payment_method: null,
      footer: null,
      rendering_options: null,
    },
    next_invoice_sequence: 1,
    phone: null,
    preferred_locales: [],
    shipping: null,
    sources: undefined,
    subscriptions: undefined,
    tax: undefined,
    tax_exempt: "none",
    tax_ids: undefined,
    test_clock: null,
    ...overrides,
  };

  return {
    id: MOCK_IDS.event,
    object: "event",
    api_version: "2025-11-17.clover",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: customer,
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: "req_test_123", idempotency_key: null },
    type: "customer.created",
  } as Stripe.Event;
}

/**
 * Creates a mock customer.updated event
 */
export function createCustomerUpdatedEvent(
  overrides?: Partial<Stripe.Customer>
): Stripe.Event {
  const baseEvent = createCustomerCreatedEvent(overrides);
  return {
    ...baseEvent,
    type: "customer.updated",
  } as Stripe.Event;
}

/**
 * Creates a mock customer.deleted event
 */
export function createCustomerDeletedEvent(): Stripe.Event {
  const deletedCustomer: Stripe.DeletedCustomer = {
    id: MOCK_IDS.customer,
    object: "customer",
    deleted: true,
  };

  return {
    id: MOCK_IDS.event,
    object: "event",
    api_version: "2025-11-17.clover",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: deletedCustomer,
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: "req_test_123", idempotency_key: null },
    type: "customer.deleted",
  } as Stripe.Event;
}

// =============================================================================
// Webhook Signature Helpers
// =============================================================================

/**
 * Creates a raw event payload string for webhook testing
 */
export function createRawEventPayload(event: Stripe.Event): string {
  return JSON.stringify(event);
}

/**
 * Test webhook secret for signature verification tests
 */
export const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests";
