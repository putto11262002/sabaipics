/**
 * Credit Queue Consumer
 *
 * Processes deferred credit ledger writes (debits and refunds) sequentially
 * to avoid the row-level lock contention on `photographers.balance`.
 *
 * Max concurrency = 1 to serialize all ledger writes per queue.
 */

import { createDbTx, creditLedger } from '@/db';
import { and, eq } from 'drizzle-orm';
import { debitLedgerOnly } from '../lib/credits/debit-ledger-only';
import { grantCredits } from '../lib/credits';
import type { Bindings } from '../types';
import type { CreditQueueMessage } from '../types/credit-queue';

export async function queue(
  batch: MessageBatch<CreditQueueMessage>,
  env: Bindings,
): Promise<void> {
  const dbTx = createDbTx(env.DATABASE_URL);

  for (const message of batch.messages) {
    const msg = message.body;

    try {
      if (msg.type === 'debit') {
        await dbTx.transaction(async (tx) => {
          // Idempotency: check if debit ledger row already exists
          const [existing] = await tx
            .select({ id: creditLedger.id })
            .from(creditLedger)
            .where(
              and(
                eq(creditLedger.photographerId, msg.photographerId),
                eq(creditLedger.type, 'debit'),
                eq(creditLedger.operationType, msg.operationType),
                eq(creditLedger.operationId, msg.operationId),
              ),
            )
            .limit(1);

          if (existing) {
            // Already processed — skip
            return;
          }

          await debitLedgerOnly(tx, {
            photographerId: msg.photographerId,
            amount: msg.amount,
            operationType: msg.operationType,
            operationId: msg.operationId,
            source: msg.source,
          }).match(
            () => {},
            (e) => { throw e; },
          );
        });
      } else if (msg.type === 'refund') {
        await dbTx.transaction(async (tx) => {
          const oneYearFromNow = new Date();
          oneYearFromNow.setUTCFullYear(oneYearFromNow.getUTCFullYear() + 1);

          await grantCredits(tx, {
            photographerId: msg.photographerId,
            amount: msg.amount,
            source: 'refund',
            expiresAt: oneYearFromNow.toISOString(),
          }).match(
            () => {},
            (e) => { throw e; },
          );
        });
      }

      message.ack();
    } catch (error) {
      console.error('[CreditQueue] Failed to process message', {
        type: msg.type,
        photographerId: msg.photographerId,
        error: error instanceof Error ? error.message : String(error),
      });
      message.retry();
    }
  }
}
