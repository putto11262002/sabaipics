import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { photographers } from '@sabaipics/db';
import { createStripeClient, createCustomer } from '../../lib/stripe';
import type { Env } from '../../types';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { apiError, type HandlerError } from '../../lib/error';

/**
 * Admin Credit Tokens API
 * POST / - Generate photographer-specific gift credit link
 *
 * Note: Currently unguarded for local testing.
 * Add requireAdmin() middleware before production deployment.
 */

export const creditTokensRouter = new Hono<Env>()
  /**
   * POST /admin/credit-tokens
   *
   * Generates a photographer-specific Stripe promo code and returns a gift link.
   * The promo code is restricted to the photographer's Stripe customer ID.
   *
   * Request body: { photographerId: string, credits: number, expiresInDays?: number }
   * Response: { url: string, code: string, expiresAt: string }
   */
  .post('/', async (c) => {
    return safeTry(async function* () {
      const db = c.var.db();

      // Parse request body
      const body = yield* ResultAsync.fromPromise(
        c.req.json(),
        (cause): HandlerError => ({ code: 'BAD_REQUEST', message: 'Invalid request body', cause }),
      );

      const { photographerId, credits, expiresInDays = 7 } = body;

      // Validate input
      if (!photographerId || typeof photographerId !== 'string') {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'photographerId is required and must be a string',
        });
      }

      if (!credits || typeof credits !== 'number' || credits <= 0) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'credits is required and must be a positive number',
        });
      }

      // Validate minimum: 167 credits = 20 THB (Stripe minimum for THB)
      const minCredits = 167;
      if (credits < minCredits) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: `Minimum ${minCredits} credits required (20 THB Stripe minimum)`,
        });
      }

      if (credits > 10000) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'credits cannot exceed 10,000 per gift link',
        });
      }

      if (expiresInDays < 1 || expiresInDays > 365) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'expiresInDays must be between 1 and 365',
        });
      }

      // Fetch photographer
      const [photographer] = yield* ResultAsync.fromPromise(
        db
          .select({
            id: photographers.id,
            email: photographers.email,
            name: photographers.name,
            stripeCustomerId: photographers.stripeCustomerId,
          })
          .from(photographers)
          .where(eq(photographers.id, photographerId))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!photographer) {
        return err<never, HandlerError>({
          code: 'NOT_FOUND',
          message: 'Photographer not found',
        });
      }

      const stripe = createStripeClient(c.env);

      // Get or create Stripe customer
      let stripeCustomerId = photographer.stripeCustomerId;

      if (!stripeCustomerId) {
        // Create Stripe customer
        const customer = yield* ResultAsync.fromPromise(
          createCustomer({
            stripe,
            photographerId: photographer.id,
            email: photographer.email,
            name: photographer.name ?? undefined,
          }),
          (cause): HandlerError => ({
            code: 'BAD_GATEWAY',
            message: 'Stripe customer creation failed',
            cause,
          }),
        );

        stripeCustomerId = customer.id;

        // Store stripe_customer_id for future use
        yield* ResultAsync.fromPromise(
          db
            .update(photographers)
            .set({ stripeCustomerId: customer.id })
            .where(eq(photographers.id, photographer.id)),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );
      }

      // Calculate gift amount in THB (for validation)
      // credits * 0.12 THB per credit
      const giftAmountThb = credits * 0.12;

      // Generate unique code
      const code = `GIFT-${generateSecureCode()}`;

      // Create Stripe coupon with 100% off
      const coupon = yield* ResultAsync.fromPromise(
        stripe.coupons.create({
          percent_off: 100,
          duration: 'once',
          metadata: {
            photographer_id: photographer.id,
            credits: credits.toString(),
            max_amount_thb: giftAmountThb.toString(),
            type: 'gift',
          },
        }),
        (cause): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: 'Stripe coupon creation failed',
          cause,
        }),
      );

      // Create photographer-specific promotion code
      const expiresAt = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60;

      const promoCode = yield* ResultAsync.fromPromise(
        stripe.promotionCodes.create({
          promotion: {
            type: 'coupon',
            coupon: coupon.id,
          },
          code,
          customer: stripeCustomerId,
          max_redemptions: 1,
          expires_at: expiresAt,
          metadata: {
            photographer_id: photographer.id,
            credits: credits.toString(),
            type: 'gift',
          },
        }),
        (cause): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: 'Stripe promotion code creation failed',
          cause,
        }),
      );

      // Generate gift link
      const dashboardUrl = c.env.DASHBOARD_FRONTEND_URL;
      const giftUrl = `${dashboardUrl}/dashboard?code=${code}`;

      return ok({
        url: giftUrl,
        code: promoCode.code,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        credits,
        photographerId: photographer.id,
      });
    })
      .orTee((e) => e.cause && console.error('[CreditTokens]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  });

/**
 * Generate a secure 8-character alphanumeric code
 * Excludes ambiguous characters (0, O, 1, I, L)
 */
function generateSecureCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
