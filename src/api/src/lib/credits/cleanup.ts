/**
 * Credit Cleanup
 *
 * Deletes all credit data for a photographer (for account deletion).
 * Must run inside an existing database transaction.
 */

import type { Transaction } from '@/db';
import { creditLedger, creditAllocations } from '@/db';
import { eq, inArray } from 'drizzle-orm';
import { ResultAsync } from 'neverthrow';
import type { CreditError } from './error';

/**
 * Delete all credit ledger entries and allocations for a photographer.
 *
 * Deletes credit_allocations first (FK constraint on credit_ledger),
 * then deletes all credit_ledger rows.
 *
 * @returns Number of credit_ledger rows deleted
 */
export function deleteAllCredits(
  tx: Transaction,
  photographerId: string,
): ResultAsync<number, CreditError> {
  return ResultAsync.fromPromise(
    (async () => {
      // Get all ledger entry IDs for this photographer (needed for allocation cleanup)
      const ledgerIds = await tx
        .select({ id: creditLedger.id })
        .from(creditLedger)
        .where(eq(creditLedger.photographerId, photographerId));

      // Delete allocations that reference any of these ledger entries
      if (ledgerIds.length > 0) {
        const ids = ledgerIds.map((r) => r.id);
        await tx
          .delete(creditAllocations)
          .where(inArray(creditAllocations.debitLedgerEntryId, ids));
        await tx
          .delete(creditAllocations)
          .where(inArray(creditAllocations.creditLedgerEntryId, ids));
      }

      // Delete all credit_ledger entries
      const deleted = await tx
        .delete(creditLedger)
        .where(eq(creditLedger.photographerId, photographerId))
        .returning({ id: creditLedger.id });

      return deleted.length;
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}
