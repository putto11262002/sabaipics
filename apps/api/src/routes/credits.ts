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

/**
 * Credit packages API
 * GET / - Public endpoint (no auth)
 * POST /checkout - Authenticated photographers only
 */

export const creditsRouter = new Hono<Env>()
  /**
   * GET /credit-packages
   *
   * Returns all active credit packages sorted by sortOrder.
   * Public endpoint - no authentication required.
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
   * Creates a Stripe Checkout session for the selected credit package.
   * Requires authenticated photographer with PDPA consent.
   *
   * Request body: { packageId: string }
   * Response: { data: { checkoutUrl: string, sessionId: string } }
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
      const packageId = body?.packageId;

      // Validate packageId
      if (!packageId || typeof packageId !== 'string') {
        return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'packageId is required' });
      }

      // Query package (must be active)
      const [pkg] = yield* ResultAsync.fromPromise(
        db.select().from(creditPackages).where(eq(creditPackages.id, packageId)).limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!pkg || !pkg.active) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Credit package not found' });
      }

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
      const cancelUrl = `${dashboardUrl}/credits/packages`;

      // Create checkout session
      const result = yield* ResultAsync.fromPromise(
        createCheckoutSession({
          stripe,
          customerId: customer.id,
          lineItems: [
            {
              name: pkg.name,
              description: `${pkg.credits} credits for photo uploads`,
              amount: pkg.priceThb, // priceThb is in satang (smallest unit)
              quantity: 1,
              metadata: { package_id: pkg.id, credits: pkg.credits.toString() },
            },
          ],
          successUrl,
          cancelUrl,
          metadata: {
            photographer_id: photographer.id,
            package_id: pkg.id,
            package_name: pkg.name,
            credits: pkg.credits.toString(),
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
