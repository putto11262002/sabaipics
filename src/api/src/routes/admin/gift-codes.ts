/**
 * Admin Gift Code Management
 *
 * Creates public gift codes (100% off) that anyone can use.
 * Per-person usage is tracked in promo_code_usage table.
 */

import { Hono } from 'hono';
import { safeTry, ok, err, ResultAsync } from 'neverthrow';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';
import { createStripeClient } from '../../lib/stripe';
import type { CreateGiftCodeRequest, CreateGiftCodeResponse } from '../../types/promo-codes';

export const giftCodesRouter = new Hono<Env>()
  /**
   * POST /admin/gift-codes
   *
   * Create a new public gift code (100% off).
   *
   * Request body:
   * {
   *   credits: number,              // Number of credits (min 167 = 20 THB Stripe minimum)
   *   expiresInDays?: number,       // Expiration (default 7, max 365)
   *   maxRedemptions?: number,      // Total usage limit (optional)
   *   customerId?: string,          // Customer-specific (optional, for private gifts)
   * }
   *
   * Response:
   * {
   *   data: {
   *     code: string,               // e.g., "GIFT-ABC12345"
   *     url: string,                // Full gift link
   *     expiresAt: string,
   *     credits: number,
   *     maxAmountThb: number,
   *     maxRedemptions: number | null,
   *     customerSpecific: boolean,
   *   }
   * }
   */
  .post('/', async (c) => {
    return safeTry(async function* () {
      const body = yield* ResultAsync.fromPromise(
        c.req.json(),
        (cause): HandlerError => ({ code: 'BAD_REQUEST', message: 'Invalid request body', cause }),
      );

      // Validate required fields
      const { credits, expiresInDays = 7, maxRedemptions, customerId } = body as CreateGiftCodeRequest;

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
          message: 'credits cannot exceed 10,000 per gift code',
        });
      }

      if (expiresInDays < 1 || expiresInDays > 365) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'expiresInDays must be between 1 and 365',
        });
      }

      if (maxRedemptions !== undefined && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'maxRedemptions must be a positive integer',
        });
      }

      const stripe = createStripeClient(c.env);

      // Calculate gift amount in THB (for Stripe metadata)
      // credits * 0.12 THB per credit
      const maxAmountThb = credits * 0.12;

      // Generate unique code
      const code = `GIFT-${generateSecureCode()}`;

      // Calculate expiration timestamp
      const expiresAt = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60;

      // Create Stripe coupon with 100% off
      const coupon = yield* ResultAsync.fromPromise(
        stripe.coupons.create({
          percent_off: 100,
          duration: 'once',
          metadata: {
            credits: credits.toString(),
            max_amount_thb: maxAmountThb.toString(),
            type: 'gift',
            created_via: 'admin_api',
          },
        }),
        (cause): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: 'Failed to create Stripe coupon',
          cause,
        }),
      );

      // Create promotion code (PUBLIC or customer-specific)
      const promoCodeParams: any = {
        promotion: {
          type: 'coupon',
          coupon: coupon.id,
        },
        code,
        expires_at: expiresAt,
        metadata: {
          credits: credits.toString(),
          type: 'gift',
          created_via: 'admin_api',
        },
      };

      // Add optional parameters
      if (maxRedemptions) {
        promoCodeParams.max_redemptions = maxRedemptions;
      }

      if (customerId) {
        promoCodeParams.customer = customerId;
      }

      const promoCode = yield* ResultAsync.fromPromise(
        stripe.promotionCodes.create(promoCodeParams),
        (cause): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: 'Failed to create Stripe promotion code',
          cause,
        }),
      );

      // Generate gift link
      const dashboardUrl = c.env.DASHBOARD_FRONTEND_URL;
      const giftUrl = `${dashboardUrl}/dashboard?code=${code}`;

      const response: CreateGiftCodeResponse = {
        code: promoCode.code,
        url: giftUrl,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        credits,
        couponId: coupon.id,
        promoCodeId: promoCode.id,
        maxAmountThb,
        maxRedemptions: maxRedemptions || null,
        customerSpecific: !!customerId,
      };

      return ok(response);
    })
      .orTee((e) => e.cause && console.error('[Admin/GiftCodes]', e.code, e.cause))
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
