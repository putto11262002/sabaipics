/**
 * Apple IAP Credits API
 *
 * GET  /apple/products       - Product catalog (public)
 * POST /apple/verify         - Verify StoreKit 2 transaction and credit ledger
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { addMonths } from 'date-fns';
import { creditLedger } from '@sabaipics/db';
import { requirePhotographer } from '../middleware';
import type { Env } from '../types';
import { safeTry, ok, err } from 'neverthrow';
import { apiError, type HandlerError } from '../lib/error';
import { getAppleProductList, getAppleProductCredits } from '../lib/apple/products';
import { verifyTransaction } from '../lib/apple/verification';

export const appleCreditsRouter = new Hono<Env>()
  /**
   * GET /apple/products
   *
   * Returns the Apple IAP product catalog.
   * Public endpoint — iOS app fetches this to display tier cards.
   */
  .get('/products', (c) => {
    return c.json({ data: { products: getAppleProductList() } });
  })

  /**
   * POST /apple/verify
   *
   * Receives a StoreKit 2 signed transaction (JWS) from the iOS app,
   * verifies it with Apple's certificate chain, and credits the ledger.
   *
   * Idempotent: duplicate transactionIds are detected and return success
   * without double-crediting.
   */
  .post('/verify', requirePhotographer(), async (c) => {
    return safeTry(async function* () {
      const body = await c.req.json<{ signedTransaction?: string }>();

      if (!body.signedTransaction || typeof body.signedTransaction !== 'string') {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'signedTransaction is required',
        });
      }

      // Verify JWS with Apple
      const decoded = await verifyTransaction(body.signedTransaction, {
        APPLE_ROOT_CA_CERT: c.env.APPLE_ROOT_CA_CERT,
        APPLE_BUNDLE_ID: c.env.APPLE_BUNDLE_ID,
        APPLE_ENVIRONMENT: c.env.APPLE_ENVIRONMENT,
      }).catch((cause) => {
        throw { code: 'BAD_REQUEST', message: 'Invalid transaction signature', cause };
      });

      // Validate product ID
      const productId = decoded.productId;
      if (!productId) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'Transaction missing productId',
        });
      }

      const credits = getAppleProductCredits(productId);
      if (credits === null) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: `Unknown product: ${productId}`,
        });
      }

      const transactionId = decoded.transactionId;
      if (!transactionId) {
        return err<never, HandlerError>({
          code: 'BAD_REQUEST',
          message: 'Transaction missing transactionId',
        });
      }

      const photographerId = c.var.photographer.id;
      const dbTx = c.var.dbTx();

      // Idempotency check + insert in transaction
      let alreadyCredited = false;
      let expiresAt: string;

      try {
        await dbTx.transaction(async (tx) => {
          // Check if already processed
          const existing = await tx
            .select()
            .from(creditLedger)
            .where(eq(creditLedger.appleTransactionId, String(transactionId)))
            .limit(1);

          if (existing.length > 0) {
            alreadyCredited = true;
            expiresAt = existing[0].expiresAt;
            return;
          }

          expiresAt = addMonths(new Date(), 6).toISOString();

          await tx.insert(creditLedger).values({
            photographerId,
            amount: credits,
            type: 'credit',
            source: 'apple_purchase',
            appleTransactionId: String(transactionId),
            expiresAt,
          });

          console.log(
            `[Apple IAP] Credited ${credits} for photographer ${photographerId} (txn: ${transactionId}, product: ${productId})`,
          );
        });
      } catch (cause) {
        return err<never, HandlerError>({
          code: 'INTERNAL_ERROR',
          message: 'Failed to process transaction',
          cause,
        });
      }

      return ok(
        c.json({
          data: {
            credits,
            expiresAt: expiresAt!,
            transactionId: String(transactionId),
            alreadyCredited,
          },
        }),
      );
    }).match(
      (response) => response,
      (e) => apiError(c, e),
    );
  });

export type AppleCreditsRouterType = typeof appleCreditsRouter;
