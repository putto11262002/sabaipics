import { Hono } from 'hono';
import { eq, asc, and } from 'drizzle-orm';
import { creditPackages, photographers, creditLedger } from '@sabaipics/db';
import { requirePhotographer } from '../middleware';
import type { Env } from '../types';
import {
  createStripeClient,
  createCheckoutSession,
  createCustomer,
  findCustomerByPhotographerId,
} from '../lib/stripe';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { apiError, type HandlerError } from '../lib/error';
import { calculateTieredDiscount, getDiscountTiers } from '../lib/pricing/discounts';
import { topUpSchema } from '../lib/pricing/validation';

/**
 * Credits API
 * GET / - Public endpoint (legacy packages - deprecated)
 * GET /preview - Preview discount calculation
 * GET /tiers - Get discount tier info
 * POST /checkout - Flexible top-up (replaces package-based checkout)
 */

export const creditsRouter = new Hono<Env>()
  /**
   * GET /credit-packages/preview?amount=X
   *
   * Preview discount calculation for flexible top-up.
   * Returns credit amount, discount, and effective rate.
   */
  .get('/preview', async (c) => {
    const amountStr = c.req.query('amount');
    const amount = parseInt(amountStr || '0', 10);

    // Validate amount
    const validation = topUpSchema.safeParse({ amount });
    if (!validation.success) {
      return c.json({ error: 'Invalid amount. Must be between 50-10,000 THB' }, 400);
    }

    // Calculate discount
    const result = calculateTieredDiscount(amount);

    return c.json(result);
  })
  /**
   * GET /credit-packages/tiers
   *
   * Returns discount tier information for UI display.
   */
  .get('/tiers', async (c) => {
    return c.json({ tiers: getDiscountTiers() });
  })
  /**
   * GET /credit-packages
   *
   * [DEPRECATED] Returns all active credit packages sorted by sortOrder.
   * Public endpoint - no authentication required.
   * Keep for backward compatibility during migration.
   */
  .get('/', async (c) => {
    return safeTry(async function* () {
      const db = c.var.db();

      const packages = yield* ResultAsync.fromPromise(
        db
          .select({
            id: creditPackages.id,
            name: creditPackages.name,
            credits: creditPackages.credits,
            priceThb: creditPackages.priceThb,
          })
          .from(creditPackages)
          .where(eq(creditPackages.active, true))
          .orderBy(asc(creditPackages.sortOrder)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok(packages);
    })
      .orTee((e) => e.cause && console.error('[Credits]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })
  /**
   * POST /credit-packages/checkout
   *
   * Creates a Stripe Checkout session for flexible credit top-up.
   * Requires authenticated photographer with PDPA consent.
   *
   * Request body: { amount: number } (THB, 50-10,000)
   * Response: { data: { checkoutUrl: string, sessionId: string, preview: DiscountResult } }
   */
  .post('/checkout', requirePhotographer(), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();

      // Parse request body
      const body = yield* ResultAsync.fromPromise(
        c.req.json(),
        (cause): HandlerError => ({ code: 'BAD_REQUEST', message: 'Invalid request body', cause }),
      );

      // Validate amount
      const validation = topUpSchema.safeParse(body);
      if (!validation.success) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: validation.error.errors[0]?.message || 'Invalid amount',
        });
      }

      const { amount } = validation.data;

      // Additional check: Stripe minimum for THB is 10 THB
      if (amount < 10) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'Amount must be at least 10 THB (Stripe minimum)',
        });
      }

      // Calculate discount and credits
      const discount = calculateTieredDiscount(amount);

      // Get or create Stripe customer
      const stripe = createStripeClient(c.env);
      let customer = yield* ResultAsync.fromPromise(
        findCustomerByPhotographerId(stripe, photographer.id),
        (cause): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: 'Stripe customer lookup failed',
          cause,
        }),
      );

      if (!customer) {
        // Fetch photographer email/name for customer creation
        const [photoRecord] = yield* ResultAsync.fromPromise(
          db
            .select({ email: photographers.email, name: photographers.name })
            .from(photographers)
            .where(eq(photographers.id, photographer.id))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        customer = yield* ResultAsync.fromPromise(
          createCustomer({
            stripe,
            photographerId: photographer.id,
            email: photoRecord.email,
            name: photoRecord.name ?? undefined,
          }),
          (cause): HandlerError => ({
            code: 'BAD_GATEWAY',
            message: 'Stripe customer creation failed',
            cause,
          }),
        );

        // Store stripe_customer_id for future use
        yield* ResultAsync.fromPromise(
          db
            .update(photographers)
            .set({ stripeCustomerId: customer.id })
            .where(eq(photographers.id, photographer.id)),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );
      }

      const dashboardUrl = c.env.DASHBOARD_FRONTEND_URL;
      const successUrl = `${dashboardUrl}/credits/success`;
      const cancelUrl = `${dashboardUrl}/credits`;

      // Create product name and description
      const productName = `${discount.creditAmount.toLocaleString()} Credits`;
      const productDescription =
        discount.discountPercent > 0
          ? `Top-up ${discount.originalAmount} THB (${discount.discountPercent}% discount applied)`
          : `Top-up ${discount.originalAmount} THB`;

      // Create checkout session
      const result = yield* ResultAsync.fromPromise(
        createCheckoutSession({
          stripe,
          customerId: customer.id,
          lineItems: [
            {
              name: productName,
              description: productDescription,
              amount: discount.finalAmount * 100, // Convert Baht → Satang for Stripe
              quantity: 1,
              metadata: {
                credits: discount.creditAmount.toString(),
                original_amount: discount.originalAmount.toString(),
                discount_percent: discount.discountPercent.toString(),
              },
            },
          ],
          successUrl,
          cancelUrl,
          metadata: {
            photographer_id: photographer.id,
            credits: discount.creditAmount.toString(), // Webhook expects 'credits' key
            original_amount: discount.originalAmount.toString(),
            discount_percent: discount.discountPercent.toString(),
            final_amount: discount.finalAmount.toString(),
            purchase_type: 'topup',
          },
          currency: 'thb',
          mode: 'payment',
        }),
        (cause): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: 'Stripe checkout session creation failed',
          cause,
        }),
      );

      return ok({
        checkoutUrl: result.url,
        sessionId: result.sessionId,
        preview: discount,
      });
    })
      .orTee((e) => e.cause && console.error('[Credits]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })
  /**
   * GET /credit-packages/purchase/:sessionId
   *
   * Checks if a Stripe checkout session has been fulfilled (credits added).
   * Requires authenticated photographer with PDPA consent.
   *
   * Response:
   * - { fulfilled: false, credits: null } - Webhook not received yet
   * - { fulfilled: true, credits: 500, expiresAt: "..." } - Webhook fulfilled
   *
   * Security: Users can only check their own purchases (filtered by photographerId)
   */
  .get('/purchase/:sessionId', requirePhotographer(), async (c) => {
    return safeTry(async function* () {
      const sessionId = c.req.param('sessionId');
      const photographer = c.var.photographer;
      const db = c.var.db();

      if (!sessionId) {
        return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'sessionId is required' });
      }

      // Query credit_ledger by stripeSessionId AND photographerId (security)
      const [purchase] = yield* ResultAsync.fromPromise(
        db
          .select({
            credits: creditLedger.amount,
            expiresAt: creditLedger.expiresAt,
          })
          .from(creditLedger)
          .where(
            and(
              eq(creditLedger.stripeSessionId, sessionId),
              eq(creditLedger.photographerId, photographer.id),
              eq(creditLedger.type, 'purchase'),
            ),
          )
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!purchase) {
        // No ledger entry found = webhook not received yet
        return ok({ fulfilled: false as const, credits: null });
      }

      // Ledger entry exists = webhook fulfilled
      return ok({
        fulfilled: true as const,
        credits: purchase.credits,
        expiresAt: purchase.expiresAt,
      });
    })
      .orTee((e) => e.cause && console.error('[Credits]', e.code, e.cause))
      .match(
        (data) => c.json(data),
        (e) => apiError(c, e),
      );
  });
