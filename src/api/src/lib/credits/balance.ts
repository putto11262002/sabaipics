/**
 * Credit Balance Queries
 *
 * Read-only queries for photographer credit balance and expiry info.
 * Works with both HTTP and transactional database instances.
 */

import type { Database, DatabaseTx, Transaction } from '@/db';
import { creditLedger, photographers } from '@/db';
import { eq, and, gt, sql } from 'drizzle-orm';
import { ResultAsync } from 'neverthrow';
import type { CreditError } from './error';

type Db = Database | DatabaseTx | Transaction;

/**
 * Recompute and persist denormalized balance cache for a photographer.
 *
 * - balance = sum(unexpired remainingCredits from credit rows)
 * - balanceInvalidateAt = earliest unexpired credit expiry (or null)
 */
export function recomputeBalanceCache(
  db: Db,
  photographerId: string,
): ResultAsync<{ balance: number; invalidateAt: string | null }, CreditError> {
  return ResultAsync.fromPromise(
    (async () => {
      const [aggregate] = await db
        .select({
          balance: sql<number>`COALESCE(SUM(${creditLedger.remainingCredits}), 0)::int`,
          invalidateAt: sql<string | null>`MIN(${creditLedger.expiresAt})`,
        })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.photographerId, photographerId),
            eq(creditLedger.type, 'credit'),
            gt(creditLedger.remainingCredits, 0),
            gt(creditLedger.expiresAt, sql`NOW()`),
          ),
        );

      const balance = aggregate?.balance ?? 0;
      const invalidateAt = aggregate?.invalidateAt ?? null;

      await db
        .update(photographers)
        .set({
          balance,
          balanceInvalidateAt: invalidateAt,
        })
        .where(eq(photographers.id, photographerId));

      console.log('[Credits] balance_recompute', {
        photographerId,
        balance,
        invalidateAt,
      });

      return { balance, invalidateAt };
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}

/**
 * Get a photographer's current credit balance.
 *
 * Fast path: returns cached balance if still valid.
 * Stale path: recomputes cache from ledger and returns refreshed value.
 */
export function getBalance(db: Db, photographerId: string): ResultAsync<number, CreditError> {
  return ResultAsync.fromPromise(
    (async () => {
      const [row] = await db
        .select({
          balance: photographers.balance,
          balanceInvalidateAt: photographers.balanceInvalidateAt,
        })
        .from(photographers)
        .where(eq(photographers.id, photographerId))
        .limit(1);

      if (!row) {
        return 0;
      }

      const nowMs = Date.now();
      const invalidateAtMs = row.balanceInvalidateAt ? new Date(row.balanceInvalidateAt).getTime() : null;

      if (invalidateAtMs !== null && invalidateAtMs > nowMs) {
        console.log('[Credits] balance_cache_hit', {
          photographerId,
          balance: row.balance,
          invalidateAt: row.balanceInvalidateAt,
        });
        return row.balance;
      }

      const recomputed = await recomputeBalanceCache(db, photographerId).match(
        (value) => value,
        (error) => {
          throw error;
        },
      );
      return recomputed.balance;
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}

/**
 * Get the nearest credit expiry date for a photographer.
 *
 * Returns the earliest expiresAt from unexpired credit rows (type = 'credit', amount > 0).
 * Returns null if no expiring credits exist.
 */
export function getNextExpiry(
  db: Db,
  photographerId: string,
): ResultAsync<string | null, CreditError> {
  return ResultAsync.fromPromise(
    (async () => {
      const [row] = await db
        .select({
          nearestExpiry: sql<string | null>`MIN(${creditLedger.expiresAt})`,
        })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.photographerId, photographerId),
            gt(creditLedger.amount, 0),
            gt(creditLedger.expiresAt, sql`NOW()`),
          ),
        );

      return row?.nearestExpiry ?? null;
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}
