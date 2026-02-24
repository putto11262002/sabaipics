/**
 * Credit Balance Queries
 *
 * Read-only queries for photographer credit balance and expiry info.
 * Works with both HTTP and transactional database instances.
 */

import type { Database, DatabaseTx, Transaction } from '@/db';
import { creditLedger } from '@/db';
import { eq, and, gt, sql } from 'drizzle-orm';
import { ResultAsync } from 'neverthrow';
import type { CreditError } from './error';

type Db = Database | DatabaseTx | Transaction;

/**
 * Get a photographer's current unexpired credit balance.
 *
 * Uses SUM of credit_ledger amounts where expiresAt > NOW().
 * This is the authoritative balance (accounts for expiry).
 */
export function getBalance(db: Db, photographerId: string): ResultAsync<number, CreditError> {
  return ResultAsync.fromPromise(
    (async () => {
      const [row] = await db
        .select({
          balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int`,
        })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.photographerId, photographerId),
            gt(creditLedger.expiresAt, sql`NOW()`),
          ),
        );

      return row?.balance ?? 0;
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
