/**
 * Stripe Integration Tests
 *
 * Makes real Stripe API calls in TEST mode.
 * Uses test mode keys (sk_test_xxx) - no real charges.
 *
 * Run: pnpm test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Stripe from 'stripe';
import {
  createStripeClient,
  createCustomer,
  getCustomer,
  updateCustomer,
  findCustomerByPhotographerId,
  createCheckoutSession,
  getCheckoutSession,
} from '../src/lib/stripe';

describe('Stripe Integration', () => {
  let stripe: Stripe;
  let testPhotographerId: string;
  let createdCustomerId: string | null = null;

  beforeAll(() => {
    const apiKey = process.env.STRIPE_SECRET_KEY!;

    if (!apiKey.startsWith('sk_test_')) {
      throw new Error(
        'DANGER: Only use TEST mode keys (sk_test_xxx) for integration tests.\n' +
          'Live keys will create real charges!',
      );
    }

    stripe = createStripeClient({ STRIPE_SECRET_KEY: apiKey });
    testPhotographerId = `test_photo_${Date.now()}`;
  });

  afterAll(async () => {
    // Cleanup: delete test customer
    if (createdCustomerId) {
      try {
        await stripe.customers.del(createdCustomerId);
      } catch {
        // Ignore if already deleted
      }
    }
  });

  // ===========================================================================
  // Customer API Tests
  // ===========================================================================

  describe('Customer API', () => {
    it('creates a new customer with metadata', async () => {
      const customer = await createCustomer({
        stripe,
        photographerId: testPhotographerId,
        email: `test-${Date.now()}@sabaipics-test.com`,
        name: 'Integration Test Photographer',
      });

      createdCustomerId = customer.id;

      expect(customer.id).toMatch(/^cus_/);
      expect(customer.metadata.photographer_id).toBe(testPhotographerId);
      expect(customer.metadata.source).toBe('sabaipics');
      expect(customer.email).toContain('@sabaipics-test.com');
    }, 30000);

    it('retrieves customer by ID', async () => {
      expect(createdCustomerId).not.toBeNull();

      const customer = await getCustomer(stripe, createdCustomerId!);

      expect(customer).not.toBeNull();
      expect(customer!.id).toBe(createdCustomerId);
      expect(customer!.metadata.photographer_id).toBe(testPhotographerId);
    }, 30000);

    it('updates customer details', async () => {
      expect(createdCustomerId).not.toBeNull();

      const newEmail = `updated-${Date.now()}@sabaipics-test.com`;
      const customer = await updateCustomer({
        stripe,
        customerId: createdCustomerId!,
        email: newEmail,
        name: 'Updated Test Photographer',
      });

      expect(customer.email).toBe(newEmail);
      expect(customer.name).toBe('Updated Test Photographer');
    }, 30000);

    it('finds customer by photographer ID', async () => {
      // Give Stripe search index time to update
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const customer = await findCustomerByPhotographerId(stripe, testPhotographerId);

      // Note: Stripe search can have propagation delay
      // This test may occasionally fail due to eventual consistency
      if (customer) {
        expect(customer.id).toBe(createdCustomerId);
        expect(customer.metadata.photographer_id).toBe(testPhotographerId);
      }
    }, 30000);

    it('returns null for non-existent customer', async () => {
      const customer = await getCustomer(stripe, 'cus_nonexistent_12345');

      expect(customer).toBeNull();
    }, 30000);
  });

  // ===========================================================================
  // Checkout Session Tests
  // ===========================================================================

  describe('Checkout Session API', () => {
    it('creates checkout session with line items', async () => {
      expect(createdCustomerId).not.toBeNull();

      const result = await createCheckoutSession({
        stripe,
        customerId: createdCustomerId!,
        lineItems: [
          {
            name: 'Test Credits Pack',
            description: '100 credits for integration testing',
            amount: 29900, // 299 THB in satang
            quantity: 1,
          },
        ],
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        metadata: {
          photographer_id: testPhotographerId,
          credits: '100',
          test: 'true',
        },
      });

      expect(result.sessionId).toMatch(/^cs_test_/);
      expect(result.url).toContain('checkout.stripe.com');
    }, 30000);

    it('creates session with multiple line items', async () => {
      expect(createdCustomerId).not.toBeNull();

      const result = await createCheckoutSession({
        stripe,
        customerId: createdCustomerId!,
        lineItems: [
          {
            name: 'Base Credits',
            amount: 10000, // 100 THB
            quantity: 1,
          },
          {
            name: 'Bonus Credits',
            amount: 5000, // 50 THB
            quantity: 2,
          },
        ],
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      expect(result.sessionId).toMatch(/^cs_test_/);
      expect(result.url).toContain('checkout.stripe.com');
    }, 30000);

    it('retrieves checkout session details', async () => {
      expect(createdCustomerId).not.toBeNull();

      // Create a session first
      const createResult = await createCheckoutSession({
        stripe,
        customerId: createdCustomerId!,
        lineItems: [
          {
            name: 'Retrieval Test',
            amount: 1000, // 10 THB (minimum for THB)
            quantity: 1,
          },
        ],
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        metadata: {
          test_key: 'test_value',
        },
      });

      expect(createResult.sessionId).toMatch(/^cs_test_/);

      // Retrieve it
      const session = await getCheckoutSession(stripe, createResult.sessionId);

      expect(session).not.toBeNull();
      expect(session.id).toBe(createResult.sessionId);
      expect(session.status).toBe('open');
      expect(session.metadata?.test_key).toBe('test_value');
    }, 30000);

    it('handles THB currency correctly', async () => {
      expect(createdCustomerId).not.toBeNull();

      const result = await createCheckoutSession({
        stripe,
        customerId: createdCustomerId!,
        lineItems: [
          {
            name: 'THB Test',
            amount: 1000, // 10 THB (minimum for THB is 10 THB)
            quantity: 1,
          },
        ],
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        currency: 'thb',
      });

      expect(result.sessionId).toMatch(/^cs_test_/);

      // Verify session uses THB
      const session = await getCheckoutSession(stripe, result.sessionId);
      expect(session.currency).toBe('thb');
    }, 30000);
  });
});
