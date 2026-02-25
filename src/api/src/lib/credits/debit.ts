/**
 * Credit Debit Operation
 *
 * Deducts credits from a photographer's balance using FIFO allocation.
 * Supports multi-credit debits that span across multiple credit entries.
 * Must run inside an existing database transaction.
 */

import type { Transaction } from '@/db';
import { creditLedger, creditAllocations, photographers, type CreditLedgerSource } from '@/db';
import { eq, and, gt, asc, sql, or, isNull } from 'drizzle-orm';
import { ResultAsync, ok, err } from 'neverthrow';
import type { CreditError } from './error';

export interface DebitCreditsParams {
  photographerId: string;
  amount: number;
  operationType: string;
  operationId: string;
  source?: CreditLedgerSource;
}

export interface DebitAllocation {
  creditLedgerEntryId: string;
  amount: number;
}

export interface DebitResult {
  debitLedgerEntryId: string;
  allocations: DebitAllocation[];
}

export interface DebitIfNotExistsResult {
  debited: boolean;
  debitResult: DebitResult | null;
}

/**
 * Debit credits from a photographer's balance within an existing transaction.
 *
 * Steps:
 * 1. Atomic `UPDATE photographers SET balance = balance - amount WHERE balance >= amount`
 * 2. FIFO loop: consume from oldest non-expired credit entries until fully allocated
 *    - For each entry: decrement remainingCredits, insert credit_allocations row
 * 3. Insert single debit row in credit_ledger
 *
 * Returns err({ type: 'insufficient_credits' }) if balance is too low
 * or not enough eligible credit entries exist.
 */
export function debitCredits(
  tx: Transaction,
  params: DebitCreditsParams,
): ResultAsync<DebitResult, CreditError> {
  const { photographerId, amount, operationType, operationId, source = 'upload' } = params;

  return ResultAsync.fromPromise(
    (async () => {
      // Step 1: Atomic balance decrement
      const decrementResult = await tx
        .update(photographers)
        .set({ balance: sql`${photographers.balance} - ${amount}` })
        .where(
          and(eq(photographers.id, photographerId), sql`${photographers.balance} >= ${amount}`),
        )
        .returning({ id: photographers.id });

      if (decrementResult.length === 0) {
        return null; // sentinel for insufficient credits
      }

      // Step 2: Insert debit row in credit_ledger
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

      // Step 3: FIFO allocation loop — consume from oldest credit entries
      let remaining = amount;
      const allocations: DebitAllocation[] = [];

      while (remaining > 0) {
        // Find oldest non-expired credit entry with remainingCredits > 0
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
          // if balance is consistent, but guard against it
          return null; // sentinel for insufficient credits
        }

        // Consume min(remaining, availableOnThisEntry)
        const available = creditEntry.remainingCredits ?? 0;
        const consume = Math.min(remaining, available);

        // Decrement remainingCredits on this credit entry
        await tx
          .update(creditLedger)
          .set({ remainingCredits: sql`${creditLedger.remainingCredits} - ${consume}` })
          .where(eq(creditLedger.id, creditEntry.id));

        // Insert allocation row
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

interface DebitCreditsIfNotExistsOptions {
  debitFn?: (tx: Transaction, params: DebitCreditsParams) => ResultAsync<DebitResult, CreditError>;
}

function isUniqueConstraintViolation(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  return 'code' in cause && cause.code === '23505';
}

/**
 * Debit credits idempotently using operation tuple identity.
 *
 * If a debit already exists for (photographerId, operationType, operationId),
 * returns { debited: false } without charging again.
 */
export function debitCreditsIfNotExists(
  tx: Transaction,
  params: DebitCreditsParams,
  options?: DebitCreditsIfNotExistsOptions,
): ResultAsync<DebitIfNotExistsResult, CreditError> {
  const debitFn = options?.debitFn ?? debitCredits;

  return ResultAsync.fromPromise(
    (async () => {
      const [existingDebit] = await tx
        .select({ id: creditLedger.id })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.photographerId, params.photographerId),
            eq(creditLedger.type, 'debit'),
            eq(creditLedger.operationType, params.operationType),
            eq(creditLedger.operationId, params.operationId),
          ),
        )
        .limit(1);

      if (existingDebit) {
        return { debited: false, debitResult: null };
      }

      try {
        const debitResult = await debitFn(tx, params).match(
          (value) => value,
          (error) => {
            throw error;
          },
        );
        return { debited: true, debitResult };
      } catch (cause) {
        if (
          cause &&
          typeof cause === 'object' &&
          'type' in cause &&
          cause.type === 'database' &&
          isUniqueConstraintViolation((cause as { cause?: unknown }).cause)
        ) {
          return { debited: false, debitResult: null };
        }
        throw cause;
      }
    })(),
    (cause): CreditError => {
      if (cause && typeof cause === 'object' && 'type' in cause) {
        const maybeCreditError = cause as Partial<CreditError>;
        if (maybeCreditError.type === 'insufficient_credits') {
          return { type: 'insufficient_credits' };
        }
        if (maybeCreditError.type === 'database') {
          return {
            type: 'database',
            cause: (cause as { cause?: unknown }).cause ?? cause,
          };
        }
      }
      return { type: 'database', cause };
    },
  );
}
