import type { Database, DatabaseTx, Transaction } from '@/db';
import { creditLedger, photographers } from '@/db';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { ResultAsync } from 'neverthrow';
import type { CreditError } from './error';

type Db = Database | DatabaseTx | Transaction;

export interface PurchaseFulfillment {
  credits: number;
  expiresAt: string;
}

export interface UsageChartPoint {
  date: string;
  credits: number;
}

export interface AdminCreditTotals {
  totalCredits: number;
  totalDebits: number;
}

export interface AdminCreditEntriesResult {
  rows: (typeof creditLedger.$inferSelect)[];
  nextCursor: string | null;
}

export function getPurchaseFulfillmentBySession(
  db: Db,
  photographerId: string,
  sessionId: string,
): ResultAsync<PurchaseFulfillment | null, CreditError> {
  return ResultAsync.fromPromise(
    (async () => {
      const [purchase] = await db
        .select({
          credits: creditLedger.amount,
          expiresAt: creditLedger.expiresAt,
        })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.stripeSessionId, sessionId),
            eq(creditLedger.photographerId, photographerId),
            eq(creditLedger.type, 'credit'),
            eq(creditLedger.source, 'purchase'),
          ),
        )
        .limit(1);

      return purchase ?? null;
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}

export function getUsageChart(
  db: Db,
  photographerId: string,
  sinceIso: string,
): ResultAsync<UsageChartPoint[], CreditError> {
  return ResultAsync.fromPromise(
    db
      .select({
        date: sql<string>`to_char(${creditLedger.createdAt}, 'YYYY-MM-DD')`,
        credits: sql<number>`coalesce(sum(abs(${creditLedger.amount})), 0)::int`,
      })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.photographerId, photographerId),
          eq(creditLedger.type, 'debit'),
          gte(creditLedger.createdAt, sinceIso),
        ),
      )
      .groupBy(sql`to_char(${creditLedger.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${creditLedger.createdAt}, 'YYYY-MM-DD')`),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}

export function getLineDeliveryCreditsSpent(
  db: Db,
  photographerId: string,
  sinceIso: string,
): ResultAsync<number, CreditError> {
  return ResultAsync.fromPromise(
    (async () => {
      const [stats] = await db
        .select({
          creditsSpent: sql<number>`coalesce(sum(abs(${creditLedger.amount})), 0)::int`,
        })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.photographerId, photographerId),
            eq(creditLedger.type, 'debit'),
            eq(creditLedger.source, 'line_delivery'),
            gte(creditLedger.createdAt, sinceIso),
          ),
        );
      return stats?.creditsSpent ?? 0;
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}

export function getStripeLedgerEntryBySession(
  db: Db,
  sessionId: string,
): ResultAsync<{ id: string } | null, CreditError> {
  return ResultAsync.fromPromise(
    (async () => {
      const [entry] = await db
        .select({ id: creditLedger.id })
        .from(creditLedger)
        .where(eq(creditLedger.stripeSessionId, sessionId))
        .limit(1);
      return entry ?? null;
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}

export function setStripeLedgerReceiptUrl(
  db: Db,
  ledgerEntryId: string,
  receiptUrl: string,
): ResultAsync<void, CreditError> {
  return ResultAsync.fromPromise(
    db
      .update(creditLedger)
      .set({ stripeReceiptUrl: receiptUrl })
      .where(eq(creditLedger.id, ledgerEntryId))
      .then(() => undefined),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}

export function getBalancesForPhotographers(
  db: Db,
  photographerIds: string[],
): ResultAsync<Map<string, number>, CreditError> {
  if (photographerIds.length === 0) {
    return ResultAsync.fromPromise(Promise.resolve(new Map<string, number>()), (cause): CreditError => ({
      type: 'database',
      cause,
    }));
  }

  return ResultAsync.fromPromise(
    (async () => {
      const rows = await db
        .select({ id: photographers.id, balance: photographers.balance })
        .from(photographers)
        .where(inArray(photographers.id, photographerIds));

      return new Map(rows.map((row) => [row.id, row.balance]));
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}

export function getAdminCreditTotals(
  db: Db,
  photographerId: string,
): ResultAsync<AdminCreditTotals, CreditError> {
  return ResultAsync.fromPromise(
    (async () => {
      const [creditStats] = await db
        .select({
          totalCredits:
            sql<number>`coalesce(sum(case when ${creditLedger.amount} > 0 then ${creditLedger.amount} else 0 end), 0)`.mapWith(
              Number,
            ),
          totalDebits:
            sql<number>`coalesce(sum(case when ${creditLedger.amount} < 0 then ${creditLedger.amount} else 0 end), 0)`.mapWith(
              Number,
            ),
        })
        .from(creditLedger)
        .where(eq(creditLedger.photographerId, photographerId));

      return {
        totalCredits: creditStats?.totalCredits ?? 0,
        totalDebits: creditStats?.totalDebits ?? 0,
      };
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}

export function getAdminCreditEntries(
  db: Db,
  photographerId: string,
  limit: number,
  cursor?: string,
): ResultAsync<AdminCreditEntriesResult, CreditError> {
  return ResultAsync.fromPromise(
    (async () => {
      const conditions = [eq(creditLedger.photographerId, photographerId)];
      if (cursor) {
        conditions.push(lt(creditLedger.createdAt, cursor));
      }

      const rows = await db
        .select()
        .from(creditLedger)
        .where(and(...conditions))
        .orderBy(desc(creditLedger.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].createdAt : null;
      return { rows: data, nextCursor };
    })(),
    (cause): CreditError => ({ type: 'database', cause }),
  );
}
