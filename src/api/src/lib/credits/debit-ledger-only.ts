/**
 * Debit Ledger-Only Operation
 *
 * Inserts debit ledger row + FIFO allocation loop WITHOUT decrementing balance.
 * Used by the credit queue consumer where balance was already decremented in the fast path.
 */

import type { Transaction } from '@/db';
import { creditLedger, creditAllocations } from '@/db';
import { eq, and, gt, asc, sql, or, isNull } from 'drizzle-orm';
import { ResultAsync, ok, err } from 'neverthrow';
import type { CreditError } from './error';
import type { DebitCreditsParams, DebitResult, DebitAllocation } from './debit';

/**
 * Insert debit ledger row + FIFO allocation loop only.
 * Balance decrement is NOT performed (already done in fast path).
 */
export function debitLedgerOnly(
  tx: Transaction,
  params: DebitCreditsParams,
): ResultAsync<DebitResult, CreditError> {
  const { photographerId, amount, operationType, operationId, source = 'upload' } = params;

  return ResultAsync.fromPromise(
    (async () => {
      // Step 1: Insert debit row in credit_ledger
      const [debitEntry] = await tx
        .insert(creditLedger)
        .values({
          photographerId,
          amount: -amount,
          type: 'debit',
          source,
          operationType,
          operationId,
          expiresAt: sql`NOW()`, // debit rows don't expire; placeholder
          stripeSessionId: null,
        })
        .returning({ id: creditLedger.id });

      // Step 2: FIFO allocation loop — consume from oldest credit entries
      let remaining = amount;
      const allocations: DebitAllocation[] = [];

      while (remaining > 0) {
        const [creditEntry] = await tx
          .select({
            id: creditLedger.id,
            remainingCredits: creditLedger.remainingCredits,
          })
          .from(creditLedger)
          .where(
            and(
              eq(creditLedger.photographerId, photographerId),
              eq(creditLedger.type, 'credit'),
              gt(creditLedger.remainingCredits, 0),
              or(isNull(creditLedger.expiresAt), gt(creditLedger.expiresAt, sql`NOW()`)),
            ),
          )
          .orderBy(asc(creditLedger.expiresAt), sql`${creditLedger.expiresAt} IS NULL`)
          .limit(1);

        if (!creditEntry) {
          // Balance was decremented but no credit entries found — shouldn't happen
          // if balance is consistent. Return what we have; recomputeBalanceCache can reconcile.
          return null;
        }

        const available = creditEntry.remainingCredits ?? 0;
        const consume = Math.min(remaining, available);

        await tx
          .update(creditLedger)
          .set({ remainingCredits: sql`${creditLedger.remainingCredits} - ${consume}` })
          .where(eq(creditLedger.id, creditEntry.id));

        await tx.insert(creditAllocations).values({
          debitLedgerEntryId: debitEntry.id,
          creditLedgerEntryId: creditEntry.id,
          amount: consume,
        });

        allocations.push({
          creditLedgerEntryId: creditEntry.id,
          amount: consume,
        });

        remaining -= consume;
      }

      return {
        debitLedgerEntryId: debitEntry.id,
        allocations,
      };
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  ).andThen((result) =>
    result === null ? err({ type: 'insufficient_credits' as const }) : ok(result),
  );
}
