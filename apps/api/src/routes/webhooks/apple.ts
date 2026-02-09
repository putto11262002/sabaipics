/**
 * Apple App Store Server Notifications v2 Webhook
 *
 * Handles incoming notifications from Apple for:
 * - REFUND: Customer got a refund → debit credits back
 * - REVOKE: Family sharing revoked → debit credits back
 * - CONSUMPTION_REQUEST: Apple asks if credits were consumed
 *
 * JWS signature verification is done via Apple's official library.
 * Always returns 200 OK — Apple retries on non-2xx responses.
 */

import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { creditLedger, type DatabaseTx } from '@sabaipics/db';
import { verifyNotification } from '../../lib/apple/verification';
import type { DecodedNotification } from '../../lib/apple/verification';

type AppleWebhookBindings = {
  APPLE_ROOT_CA_CERT: string;
  APPLE_BUNDLE_ID: string;
  APPLE_ENVIRONMENT: string;
};

type AppleWebhookVariables = {
  dbTx: () => DatabaseTx;
};

/**
 * Handle REFUND or REVOKE: debit credits back from the ledger.
 * If balance goes negative, that's expected — user can't upload until they buy more.
 */
async function handleRefund(
  dbTx: DatabaseTx,
  transactionId: string,
  originalTransactionId: string,
): Promise<void> {
  await dbTx.transaction(async (tx) => {
    // Find the original credit entry by the original transaction ID
    const [original] = await tx
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.appleTransactionId, originalTransactionId))
      .limit(1);

    if (!original) {
      console.log(
        `[Apple Webhook] REFUND: No ledger entry found for originalTransactionId: ${originalTransactionId}`,
      );
      return;
    }

    // Check if refund already processed (idempotency)
    const [existingRefund] = await tx
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.appleTransactionId, transactionId))
      .limit(1);

    if (existingRefund) {
      console.log(
        `[Apple Webhook] REFUND: Already processed for transactionId: ${transactionId}`,
      );
      return;
    }

    // Debit the original credit amount
    await tx.insert(creditLedger).values({
      photographerId: original.photographerId,
      amount: -original.amount,
      type: 'debit',
      source: 'refund',
      appleTransactionId: transactionId,
      expiresAt: original.expiresAt,
    });

    console.log(
      `[Apple Webhook] REFUND: Debited ${original.amount} credits for photographer ${original.photographerId} (refund txn: ${transactionId})`,
    );
  });
}

/**
 * Handle CONSUMPTION_REQUEST: Apple asks if credits were consumed.
 * We check how many of the original credits have been spent on uploads.
 *
 * Note: Responding to consumption requests requires the App Store Server API.
 * For now, we log the request. Full implementation requires an API key.
 */
async function handleConsumptionRequest(
  dbTx: DatabaseTx,
  originalTransactionId: string,
): Promise<void> {
  // Find the original credit entry
  const [original] = await dbTx
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.appleTransactionId, originalTransactionId))
    .limit(1);

  if (!original) {
    console.log(
      `[Apple Webhook] CONSUMPTION_REQUEST: No entry found for: ${originalTransactionId}`,
    );
    return;
  }

  // Calculate how many credits this photographer has consumed (all-time debit sum)
  const [result] = await dbTx
    .select({
      totalDebits: sql<number>`COALESCE(SUM(ABS(${creditLedger.amount})), 0)::int`,
    })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.photographerId, original.photographerId),
        eq(creditLedger.type, 'debit'),
        eq(creditLedger.source, 'upload'),
      ),
    );

  const consumed = result?.totalDebits ?? 0;
  const originalCredits = original.amount;

  // Determine consumption status
  let status: string;
  if (consumed >= originalCredits) {
    status = 'FULLY_CONSUMED';
  } else if (consumed > 0) {
    status = 'PARTIALLY_CONSUMED';
  } else {
    status = 'NOT_CONSUMED';
  }

  console.log(
    `[Apple Webhook] CONSUMPTION_REQUEST: photographer=${original.photographerId}, ` +
      `original=${originalCredits}, consumed=${consumed}, status=${status}`,
  );

  // TODO: Respond to Apple via App Store Server API with consumption status
  // Requires APPLE_API_KEY, APPLE_KEY_ID, APPLE_ISSUER_ID env vars
  // See: https://developer.apple.com/documentation/appstoreserverapi/send_consumption_information
}

export const appleWebhookRouter = new Hono<{
  Bindings: AppleWebhookBindings;
  Variables: AppleWebhookVariables;
}>().post('/', async (c) => {
  const body = await c.req.json<{ signedPayload?: string }>().catch(() => null);

  if (!body?.signedPayload) {
    // Always return 200 to prevent Apple from retrying malformed requests
    console.error('[Apple Webhook] Missing signedPayload');
    return c.json({ received: true });
  }

  let notification: DecodedNotification;
  try {
    notification = await verifyNotification(body.signedPayload, {
      APPLE_ROOT_CA_CERT: c.env.APPLE_ROOT_CA_CERT,
      APPLE_BUNDLE_ID: c.env.APPLE_BUNDLE_ID,
      APPLE_ENVIRONMENT: c.env.APPLE_ENVIRONMENT,
    });
  } catch (err) {
    console.error(
      `[Apple Webhook] Verification failed:`,
      err instanceof Error ? err.message : err,
    );
    // Return 200 to prevent retries for permanently invalid payloads
    return c.json({ received: true });
  }

  const notificationType = notification.notificationType;
  console.log(`[Apple Webhook] Processing: ${notificationType}`);

  const dbTx = c.var.dbTx();

  // Extract transaction info from the notification data
  const transactionInfo = notification.data?.signedTransactionInfo;
  if (!transactionInfo) {
    console.log(`[Apple Webhook] No transaction info in notification: ${notificationType}`);
    return c.json({ received: true });
  }

  // The signedTransactionInfo in the notification is itself a JWS that needs verification
  let transactionId: string | undefined;
  let originalTransactionId: string | undefined;

  try {
    const { verifyTransaction } = await import('../../lib/apple/verification');
    const decoded = await verifyTransaction(transactionInfo, {
      APPLE_ROOT_CA_CERT: c.env.APPLE_ROOT_CA_CERT,
      APPLE_BUNDLE_ID: c.env.APPLE_BUNDLE_ID,
      APPLE_ENVIRONMENT: c.env.APPLE_ENVIRONMENT,
    });
    transactionId = decoded.transactionId ? String(decoded.transactionId) : undefined;
    originalTransactionId = decoded.originalTransactionId
      ? String(decoded.originalTransactionId)
      : undefined;
  } catch (err) {
    console.error(
      `[Apple Webhook] Failed to decode transaction info:`,
      err instanceof Error ? err.message : err,
    );
    return c.json({ received: true });
  }

  if (!transactionId || !originalTransactionId) {
    console.log(`[Apple Webhook] Missing transaction IDs in: ${notificationType}`);
    return c.json({ received: true });
  }

  try {
    switch (notificationType) {
      case 'REFUND':
      case 'REVOKE':
        await handleRefund(dbTx, transactionId, originalTransactionId);
        break;

      case 'CONSUMPTION_REQUEST':
        await handleConsumptionRequest(dbTx, originalTransactionId);
        break;

      default:
        console.log(`[Apple Webhook] Unhandled notification type: ${notificationType}`);
    }
  } catch (err) {
    console.error(
      `[Apple Webhook] Handler error for ${notificationType}:`,
      err instanceof Error ? err.message : err,
    );
  }

  // Always return 200
  return c.json({ received: true });
});

export type AppleWebhookRouterType = typeof appleWebhookRouter;
