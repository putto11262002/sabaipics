/**
 * Admin Discount Code Management
 *
 * Creates promotional discount codes for credit purchases.
 * Unlike gift codes (100% free), these are partial discounts.
 */

import { Hono } from 'hono';
import { safeTry, ok, err, ResultAsync } from 'neverthrow';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';
import { createStripeClient } from '../../lib/stripe';
import type { CreateDiscountCodeRequest, CreateDiscountCodeResponse } from '../../types/promo-codes';

export const discountCodesRouter = new Hono<Env>()
  /**
   * POST /admin/discount-codes
   *
   * Create a new discount code for credit purchases.
   *
   * Request body:
   * {
   *   code: string,                    // Promo code (e.g., "LAUNCH20")
   *   discountType: 'percent' | 'amount',
   *   discountValue: number,           // Percentage (1-100) or amount in THB
   *   duration: 'once' | 'repeating' | 'forever',
   *   maxRedemptions?: number,         // Total usage limit (optional)
   *   expiresInDays?: number,          // Expiration (optional)
   *   minAmountThb?: number,           // Minimum purchase amount (optional)
   *   customerId?: string,             // Customer-specific (optional)
   * }
   *
   * Response:
   * {
   *   data: {
   *     code: string,
   *     discountType: string,
   *     discountValue: number,
   *     expiresAt: string | null,
   *     maxRedemptions: number | null,
   *     minAmountThb: number | null,
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
      const { code, discountType, discountValue, duration, maxRedemptions, expiresInDays, minAmountThb, customerId } = body as CreateDiscountCodeRequest;

      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'code is required and must be a non-empty string',
        });
      }

      if (!['percent', 'amount'].includes(discountType)) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'discountType must be "percent" or "amount"',
        });
      }

      if (!discountValue || typeof discountValue !== 'number' || discountValue <= 0) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'discountValue is required and must be a positive number',
        });
      }

      if (discountType === 'percent' && (discountValue < 1 || discountValue > 99)) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'discountValue for percent type must be between 1-99 (use gift codes for 100% off)',
        });
      }

      if (!['once', 'repeating', 'forever'].includes(duration)) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'duration must be "once", "repeating", or "forever"',
        });
      }

      // Validate optional fields
      if (maxRedemptions !== undefined && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'maxRedemptions must be a positive integer',
        });
      }

      if (expiresInDays !== undefined && (!Number.isInteger(expiresInDays) || expiresInDays < 1)) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'expiresInDays must be a positive integer',
        });
      }

      if (minAmountThb !== undefined && (typeof minAmountThb !== 'number' || minAmountThb < 20)) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'minAmountThb must be at least 20 THB (Stripe minimum)',
        });
      }

      const stripe = createStripeClient(c.env);

      // Calculate expiration timestamp
      const expiresAt = expiresInDays
        ? Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60
        : null;

      // Create Stripe coupon
      const couponParams: any = {
        duration,
        name: code,
        metadata: {
          type: 'discount',
          created_via: 'admin_api',
        },
      };

      if (discountType === 'percent') {
        couponParams.percent_off = discountValue;
      } else {
        // Amount in satang (THB * 100)
        couponParams.amount_off = Math.round(discountValue * 100);
        couponParams.currency = 'thb';
      }

      if (minAmountThb) {
        couponParams.metadata.min_amount_thb = minAmountThb.toString();
      }

      const coupon = yield* ResultAsync.fromPromise(
        stripe.coupons.create(couponParams),
        (cause): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: 'Failed to create Stripe coupon',
          cause,
        }),
      );

      // Create promotion code
      const promoCodeParams: any = {
        promotion: {
          type: 'coupon',
          coupon: coupon.id,
        },
        code: code.toUpperCase(),
        metadata: {
          type: 'discount',
          created_via: 'admin_api',
        },
      };

      if (maxRedemptions) {
        promoCodeParams.max_redemptions = maxRedemptions;
      }

      if (expiresAt) {
        promoCodeParams.expires_at = expiresAt;
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

      const response: CreateDiscountCodeResponse = {
        code: promoCode.code,
        couponId: coupon.id,
        promoCodeId: promoCode.id,
        discountType,
        discountValue,
        duration,
        expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
        maxRedemptions: maxRedemptions || null,
        minAmountThb: minAmountThb || null,
        customerSpecific: !!customerId,
      };

      return ok(response);
    })
      .orTee((e) => e.cause && console.error('[Admin/DiscountCodes]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  });
