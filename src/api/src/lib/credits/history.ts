/**
 * Credit History Query
 *
 * Paginated credit ledger entries with summary statistics.
 * Works with both HTTP and transactional database instances.
 */

import type { Database, DatabaseTx, Transaction } from '@/db';
import { creditLedger } from '@/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { ResultAsync } from 'neverthrow';
import type { CreditError } from './error';
import { getBalanceSummary } from './balance';

type Db = Database | DatabaseTx | Transaction;

export interface CreditHistoryParams {
  photographerId: string;
  page: number;
  limit: number;
  typeFilter?: 'credit' | 'debit';
}

export interface CreditHistoryEntry {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  source: string;
  promoCode: string | null;
  stripeReceiptUrl: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface CreditHistorySummary {
  balance: number;
  expiringSoon: number;
  usedThisMonth: number;
}

export interface CreditHistoryResult {
  entries: CreditHistoryEntry[];
  summary: CreditHistorySummary;
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
  };
}

/**
 * Get paginated credit history with summary stats for a photographer.
 *
 * Summary always covers all types (not filtered), while entries respect the type filter.
 */
export function getCreditHistory(
  db: Db,
  params: CreditHistoryParams,
): ResultAsync<CreditHistoryResult, CreditError> {
  const { photographerId, page, limit, typeFilter } = params;
  const offset = page * limit;

  return ResultAsync.fromPromise(
    (async () => {
      // Build where conditions
      const conditions = [eq(creditLedger.photographerId, photographerId)];
      if (typeFilter === 'credit' || typeFilter === 'debit') {
        conditions.push(eq(creditLedger.type, typeFilter));
      }

      // Paginated entries
      const rows = await db
        .select({
          id: creditLedger.id,
          amount: creditLedger.amount,
          type: creditLedger.type,
          source: creditLedger.source,
          promoCode: creditLedger.promoCode,
          stripeReceiptUrl: creditLedger.stripeReceiptUrl,
          expiresAt: creditLedger.expiresAt,
          createdAt: creditLedger.createdAt,
        })
        .from(creditLedger)
        .where(and(...conditions))
        .orderBy(desc(creditLedger.createdAt))
        .limit(limit)
        .offset(offset);

      const entries: CreditHistoryEntry[] = rows as CreditHistoryEntry[];

      // Total count for pagination
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(creditLedger)
        .where(and(...conditions));
      const totalCount = countResult?.count ?? 0;

      // Summary stats via credit service (single source of truth)
      const summary = await getBalanceSummary(db, photographerId).match(
        (value) => value,
        (error) => {
          throw error;
        },
      );

      const totalPages = Math.ceil(totalCount / limit);

      return {
        entries,
        summary,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages - 1,
        },
      };
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}
