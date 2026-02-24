/**
 * Stripe Client Factory
 *
 * Creates a Stripe client configured for Cloudflare Workers environment.
 * Workers don't have Node.js http module, so we use Fetch-based HTTP client.
 */

import Stripe from 'stripe';

/**
 * Environment variables required for Stripe client
 */
export interface StripeEnv {
  STRIPE_SECRET_KEY: string;
}

/**
 * Creates a Stripe client configured for Cloudflare Workers
 *
 * @param env - Environment bindings containing STRIPE_SECRET_KEY
 * @returns Configured Stripe client instance
 * @throws Error if STRIPE_SECRET_KEY is not provided
 *
 * @example
 * ```typescript
 * const stripe = createStripeClient(c.env);
 * const customer = await stripe.customers.create({ email: 'test@example.com' });
 * ```
 */
export function createStripeClient(env: StripeEnv): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is required');
  }

  return new Stripe(env.STRIPE_SECRET_KEY, {
    // Required for Cloudflare Workers (no Node.js http module)
    httpClient: Stripe.createFetchHttpClient(),
    // Auto-retry with exponential backoff for transient errors
    maxNetworkRetries: 2,
    // Shorter timeout for edge environment (default is 80s)
    timeout: 20000,
  });
}

/**
 * WebCrypto provider for webhook signature verification
 *
 * Required for Cloudflare Workers since they use Web Crypto API
 * instead of Node.js crypto module.
 *
 * @example
 * ```typescript
 * const event = await stripe.webhooks.constructEventAsync(
 *   rawBody,
 *   signature,
 *   webhookSecret,
 *   undefined,
 *   webCrypto
 * );
 * ```
 */
export const webCrypto = Stripe.createSubtleCryptoProvider();
