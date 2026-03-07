/**
 * Fast-path Credit Debit
 *
 * Atomic `UPDATE photographers SET balance = balance - N WHERE balance >= N`
 * + send deferred ledger message to credit queue.
 *
 * No DB transaction needed — the balance decrement is a single atomic SQL statement.
 * The FIFO ledger bookkeeping is deferred to the credit queue consumer.
 */

import type { Database } from '@/db';
import { photographers, photoJobs } from '@/db';
import { and, eq, sql } from 'drizzle-orm';
import { ResultAsync, ok, err } from 'neverthrow';
import type { CreditError } from './error';
import type { CreditLedgerSource } from '@/db';
import type { CreditDebitMessage } from '../../types/credit-queue';

interface FastDebitParams {
  photographerId: string;
  amount: number;
  operationType: string;
  operationId: string;
  source: CreditLedgerSource;
}

/**
 * Atomically decrement balance and send a deferred ledger message to the credit queue.
 *
 * Returns `{ debited: true }` on success, err `insufficient_credits` if balance too low.
 */
export function fastDebitBalance(
  db: Database,
  creditQueue: Queue<CreditDebitMessage>,
  params: FastDebitParams,
): ResultAsync<{ debited: boolean }, CreditError> {
  const { photographerId, amount, operationType, operationId, source } = params;

  return ResultAsync.fromPromise(
    (async () => {
      // Step 1: Atomic balance decrement
      const decrementResult = await db
        .update(photographers)
        .set({ balance: sql`${photographers.balance} - ${amount}` })
        .where(
          and(eq(photographers.id, photographerId), sql`${photographers.balance} >= ${amount}`),
        )
        .returning({ id: photographers.id });

      if (decrementResult.length === 0) {
        return null; // sentinel for insufficient credits
      }

      // Step 2: Send deferred ledger message to credit queue
      await creditQueue.send({
        type: 'debit',
        photographerId,
        amount,
        operationType,
        operationId,
        source,
      });

      return { debited: true };
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  ).andThen((result) =>
    result === null ? err({ type: 'insufficient_credits' as const }) : ok(result),
  );
}

/**
 * Idempotent fast debit — skip decrement if photo_job already has creditsDebited > 0
 * for the given upload intent.
 */
export function fastDebitBalanceIfNotExists(
  db: Database,
  creditQueue: Queue<CreditDebitMessage>,
  params: FastDebitParams & { intentId: string },
): ResultAsync<{ debited: boolean }, CreditError> {
  return ResultAsync.fromPromise(
    (async () => {
      const [existing] = await db
        .select({ creditsDebited: photoJobs.creditsDebited })
        .from(photoJobs)
        .where(
          and(
            eq(photoJobs.uploadIntentId, params.intentId),
            sql`${photoJobs.creditsDebited} > 0`,
          ),
        )
        .limit(1);

      if (existing) {
        return { debited: false };
      }
      return null; // needs debit
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  ).andThen((result) =>
    result !== null
      ? ok(result)
      : fastDebitBalance(db, creditQueue, params),
  );
}
