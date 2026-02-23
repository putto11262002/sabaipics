import { Hono } from 'hono';
import { z } from 'zod';
import { eq, asc, and, desc, sql, gte } from 'drizzle-orm';
import { creditPackages, photographers, creditLedger, promoCodeUsage, giftCodes, giftCodeRedemptions } from '@/db';
import { requirePhotographer } from '../middleware';
import { zValidator } from '@hono/zod-validator';
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
import { getCreditHistory } from '../lib/credits';
import { grantCredits } from '../lib/credits/grant';

/**
 * Credits API
 * GET / - Public endpoint (legacy packages - deprecated)
 * GET /preview - Preview discount calculation
 * GET /tiers - Get discount tier info
 * POST /checkout - Flexible top-up (replaces package-based checkout)
 */

export const creditsRouter = new Hono<Env>()
  /**
   * GET /credit-packages/promo-code/validate?code=XXX
   *
   * Validates a promo code and returns its type (gift or discount) with relevant details.
   * Public endpoint - no authentication required (validation happens at checkout).
   */
  .get('/promo-code/validate', async (c) => {
    return safeTry(async function* () {
      const code = c.req.query('code');

      if (!code) {
        return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'code parameter is required' });
      }

      const stripe = createStripeClient(c.env);

      // Fetch promo code from Stripe with coupon expanded
      const promoCodes = yield* ResultAsync.fromPromise(
        stripe.promotionCodes.list({
          code,
          active: true,
          limit: 1,
          expand: ['data.promotion.coupon'],
        }),
        (cause): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: 'Failed to validate promo code',
          cause,
        }),
      );

      if (promoCodes.data.length === 0) {
        return err<never, HandlerError>({
          code: 'NOT_FOUND',
          message: 'Invalid or expired promo code',
        });
      }

      const promoCodeObj = promoCodes.data[0];
      const coupon = promoCodeObj.promotion?.coupon;

      if (!coupon || typeof coupon !== 'object') {
        return err<never, HandlerError>({
          code: 'INTERNAL_ERROR',
          message: 'Coupon data not available',
        });
      }

      // Check if it's a gift code (100% off + type=gift)
      const metadata = coupon.metadata || {};
      const isGiftCode = coupon.percent_off === 100 && metadata.type === 'gift';

      if (isGiftCode) {
        // Gift code response
        const maxAmountThb = parseFloat(metadata.max_amount_thb || '0');
        const credits = parseInt(metadata.credits || '0', 10);
        const expiresAt = promoCodeObj.expires_at
          ? new Date(promoCodeObj.expires_at * 1000).toISOString()
          : null;

        return ok({
          type: 'gift' as const,
          code: promoCodeObj.code,
          credits,
          maxAmountThb,
          expiresAt,
        });
      } else {
        // Discount code response
        const discountPercent = coupon.percent_off || 0;
        const discountAmount = coupon.amount_off || 0;
        const minAmountThb = parseFloat(metadata.min_amount_thb || '0');

        return ok({
          type: 'discount' as const,
          code: promoCodeObj.code,
          discountPercent,
          discountAmount,
          discountType: coupon.percent_off ? ('percent' as const) : ('amount' as const),
          minAmountThb: minAmountThb > 0 ? minAmountThb : null,
        });
      }
    })
      .orTee((e) => e.cause && console.error('[Credits]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })
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

      const { amount, promoCode } = body;

      // Basic amount validation
      if (typeof amount !== 'number' || amount <= 0) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'Amount must be a positive number',
        });
      }

      // Initialize Stripe client (used for promo validation and customer management)
      const stripe = createStripeClient(c.env);
      let isGiftCode = false;
      let cachedPromoCode: any = null; // Store for reuse

      if (promoCode && typeof promoCode === 'string') {
        const promoCodes = yield* ResultAsync.fromPromise(
          stripe.promotionCodes.list({
            code: promoCode,
            active: true,
            limit: 1,
            expand: ['data.promotion.coupon'],
          }),
          (cause): HandlerError => ({
            code: 'BAD_GATEWAY',
            message: 'Failed to validate promo code',
            cause,
          }),
        );

        if (promoCodes.data.length === 0) {
          return err<never, HandlerError>({
            code: 'BAD_REQUEST',
            message: 'Invalid or expired promo code',
          });
        }

        cachedPromoCode = promoCodes.data[0];
        const coupon = cachedPromoCode.promotion?.coupon;
        if (coupon && typeof coupon === 'object') {
          const metadata = coupon.metadata || {};
          isGiftCode = coupon.percent_off === 100 && metadata.type === 'gift';
        }

        // Check if photographer has already used this promo code
        const existingUsage = yield* ResultAsync.fromPromise(
          db
            .select()
            .from(promoCodeUsage)
            .where(
              and(
                eq(promoCodeUsage.photographerId, photographer.id),
                eq(promoCodeUsage.promoCode, promoCode),
              ),
            )
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (existingUsage.length > 0) {
          return err<never, HandlerError>({
            code: 'BAD_REQUEST',
            message: 'You have already used this promo code',
          });
        }
      }

      // Apply appropriate minimum based on type
      if (isGiftCode) {
        // Gift codes: Stripe minimum only (20 THB)
        if (amount < 20) {
          return err<never, HandlerError>({
            code: 'BAD_REQUEST',
            message: 'Amount must be at least 20 THB (Stripe minimum)',
          });
        }
      } else {
        // Regular top-ups: Business rule (50 THB minimum)
        const validation = topUpSchema.safeParse(body);
        if (!validation.success) {
          return err<never, HandlerError>({
            code: 'BAD_REQUEST',
            message: validation.error.errors[0]?.message || 'Invalid amount',
          });
        }
      }

      // Max amount check (applies to both)
      if (amount > 10000) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'Maximum top-up is 10,000 THB',
        });
      }

      // Calculate discount and credits
      const discount = calculateTieredDiscount(amount);

      // Get or create Stripe customer
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

      // Build cancel URL - include promo code if present so dialog reopens on cancel
      let cancelUrl = `${dashboardUrl}/dashboard`;
      if (promoCode && typeof promoCode === 'string') {
        cancelUrl = `${dashboardUrl}/dashboard?code=${encodeURIComponent(promoCode)}`;
      }

      // Validate and apply promo code if provided
      let appliedPromoCode: string | null = null;
      if (cachedPromoCode) {
        // Reuse previously fetched promo code
        const promoCodeObj = cachedPromoCode;

        // Verify promo code is for this customer (if customer-specific)
        if (promoCodeObj.customer && promoCodeObj.customer !== customer.id) {
          return err<never, HandlerError>({
            code: 'BAD_REQUEST',
            message: 'This promo code is not valid for your account',
          });
        }

        // Check if max redemptions reached
        if (
          promoCodeObj.max_redemptions &&
          promoCodeObj.times_redeemed >= promoCodeObj.max_redemptions
        ) {
          return err<never, HandlerError>({
            code: 'BAD_REQUEST',
            message: 'This promo code has reached its usage limit',
          });
        }

        // Get coupon details (should be expanded)
        const coupon = promoCodeObj.promotion?.coupon;

        // Validate gift code amount (100% off coupons with max_amount_thb)
        if (coupon && typeof coupon === 'object') {
          const metadata = coupon.metadata || {};
          const isGiftCode = coupon.percent_off === 100 && metadata.type === 'gift';

          if (isGiftCode) {
            const maxAmountThb = parseFloat(metadata.max_amount_thb || '0');
            const giftCredits = parseInt(metadata.credits || '0', 10);

            if (maxAmountThb > 0 && amount > maxAmountThb) {
              return err<never, HandlerError>({
                code: 'BAD_REQUEST',
                message: `This gift code is only valid for up to ${maxAmountThb} THB (${giftCredits} credits). Please adjust your amount.`,
              });
            }

            // For gift codes, ensure exact amount or less
            if (amount < maxAmountThb * 0.5) {
              return err<never, HandlerError>({
                code: 'BAD_REQUEST',
                message: `This gift code is for ${giftCredits} credits (${maxAmountThb} THB). Please enter the full gift amount.`,
              });
            }
          }
        }

        appliedPromoCode = promoCodeObj.id; // Store Stripe promo code ID
      }

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
          ...(appliedPromoCode && {
            discounts: [{ promotion_code: appliedPromoCode }],
          }),
          successUrl,
          cancelUrl,
          metadata: {
            photographer_id: photographer.id,
            credits: discount.creditAmount.toString(), // Webhook expects 'credits' key
            original_amount: discount.originalAmount.toString(),
            discount_percent: discount.discountPercent.toString(),
            final_amount: discount.finalAmount.toString(),
            purchase_type: 'topup',
            ...(promoCode && { promo_code_applied: promoCode }),
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
              eq(creditLedger.type, 'credit'),
              eq(creditLedger.source, 'purchase'),
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
  })
  /**
   * GET /credit-packages/history?page=0&limit=20&type=credit|debit
   *
   * Returns paginated credit ledger entries + summary stats.
   * Requires authenticated photographer.
   */
  .get('/history', requirePhotographer(), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();

      const page = Math.max(0, parseInt(c.req.query('page') || '0', 10));
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
      const typeFilter = c.req.query('type') as 'credit' | 'debit' | undefined;

      const result = yield* getCreditHistory(db, { photographerId: photographer.id, page, limit, typeFilter })
        .mapErr((e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e.cause }));

      return ok(result);
    })
      .orTee((e) => e.cause && console.error('[Credits]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })
  /**
   * GET /credit-packages/usage-chart?days=30
   *
   * Returns daily aggregated debit amounts for the bar chart.
   * Requires authenticated photographer.
   */
  .get('/usage-chart', requirePhotographer(), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();

      const days = Math.min(90, Math.max(1, parseInt(c.req.query('days') || '30', 10)));
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);

      const rows = yield* ResultAsync.fromPromise(
        db
          .select({
            date: sql<string>`to_char(${creditLedger.createdAt}, 'YYYY-MM-DD')`,
            credits: sql<number>`coalesce(sum(abs(${creditLedger.amount})), 0)::int`,
          })
          .from(creditLedger)
          .where(
            and(
              eq(creditLedger.photographerId, photographer.id),
              eq(creditLedger.type, 'debit'),
              gte(creditLedger.createdAt, sinceDate.toISOString()),
            ),
          )
          .groupBy(sql`to_char(${creditLedger.createdAt}, 'YYYY-MM-DD')`)
          .orderBy(sql`to_char(${creditLedger.createdAt}, 'YYYY-MM-DD')`),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok(rows);
    })
      .orTee((e) => e.cause && console.error('[Credits]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })
  /**
   * POST /credit-packages/redeem
   *
   * Redeem an in-house gift code for instant credits.
   * No Stripe involved — direct DB transaction.
   */
  .post(
    '/redeem',
    requirePhotographer(),
    zValidator('json', z.object({ code: z.string().min(1).max(30) })),
    async (c) => {
      const { code } = c.req.valid('json');
      const photographer = c.var.photographer;
      const db = c.var.db();
      const dbTx = c.var.dbTx();

      return safeTry(async function* () {
        // 1. Code exists and active (read via HTTP adapter — no transaction needed)
        const [giftCode] = yield* ResultAsync.fromPromise(
          db
            .select()
            .from(giftCodes)
            .where(and(eq(giftCodes.code, code), eq(giftCodes.active, true)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!giftCode) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Invalid or inactive gift code' });
        }

        // 2. Not expired
        if (giftCode.expiresAt && new Date(giftCode.expiresAt) < new Date()) {
          return err<never, HandlerError>({ code: 'GONE', message: 'This gift code has expired' });
        }

        // 3. User eligible (targetPhotographerIds)
        if (
          giftCode.targetPhotographerIds &&
          giftCode.targetPhotographerIds.length > 0 &&
          !giftCode.targetPhotographerIds.includes(photographer.id)
        ) {
          return err<never, HandlerError>({ code: 'FORBIDDEN', message: 'This gift code is not available for your account' });
        }

        // Transaction: check limits + grant credits + record redemption (atomic)
        const creditExpiresAt = new Date();
        creditExpiresAt.setDate(creditExpiresAt.getDate() + giftCode.creditExpiresInDays);

        const txResult = yield* ResultAsync.fromPromise(
          dbTx.transaction(async (tx) => {
            // 4. Per-user limit (inside transaction for atomicity)
            const [userRedemptions] = await tx
              .select({ count: sql<number>`count(*)`.mapWith(Number) })
              .from(giftCodeRedemptions)
              .where(
                and(
                  eq(giftCodeRedemptions.giftCodeId, giftCode.id),
                  eq(giftCodeRedemptions.photographerId, photographer.id),
                ),
              );

            if (userRedemptions.count >= giftCode.maxRedemptionsPerUser) {
              throw Object.assign(new Error('You have already redeemed this gift code'), { handlerCode: 'CONFLICT' as const });
            }

            // 5. Global limit (inside transaction for atomicity)
            if (giftCode.maxRedemptions != null) {
              const [totalRedemptions] = await tx
                .select({ count: sql<number>`count(*)`.mapWith(Number) })
                .from(giftCodeRedemptions)
                .where(eq(giftCodeRedemptions.giftCodeId, giftCode.id));

              if (totalRedemptions.count >= giftCode.maxRedemptions) {
                throw Object.assign(new Error('This gift code has reached its maximum redemptions'), { handlerCode: 'CONFLICT' as const });
              }
            }

            // Grant credits
            const grantResult = await grantCredits(tx, {
              photographerId: photographer.id,
              amount: giftCode.credits,
              source: 'gift',
              expiresAt: creditExpiresAt.toISOString(),
              promoCode: giftCode.code,
            }).match(
              (r) => r,
              (e) => { throw new Error(`Grant failed: ${e.type}`); },
            );

            // Record redemption
            await tx.insert(giftCodeRedemptions).values({
              giftCodeId: giftCode.id,
              photographerId: photographer.id,
              creditsGranted: giftCode.credits,
              creditLedgerEntryId: grantResult.ledgerEntryId,
            });

            return grantResult;
          }),
          (cause): HandlerError => {
            const err = cause as Error & { handlerCode?: string };
            if (err.handlerCode === 'CONFLICT') {
              return { code: 'CONFLICT', message: err.message };
            }
            return { code: 'INTERNAL_ERROR', message: 'Failed to grant credits', cause };
          },
        );

        return ok({
          creditsGranted: giftCode.credits,
          expiresAt: creditExpiresAt.toISOString(),
        });
      })
        .orTee((e) => e.cause && console.error('[Credits]', e.code, e.cause))
        .match(
          (data) => c.json({ data }),
          (e) => apiError(c, e),
        );
    },
  );
