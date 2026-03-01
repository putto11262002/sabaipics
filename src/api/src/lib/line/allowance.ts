/**
 * LINE Delivery Monthly Allowance
 *
 * Tracks monthly LINE push message usage against the free tier limit.
 * Photographers get FREE_MONTHLY_LINE_MESSAGES free messages per calendar month.
 * Beyond that, messages cost credits (overage).
 */

import type { Database } from '@/db';
import { lineDeliveries } from '@/db';
import { eq, sql, gte } from 'drizzle-orm';
import { ResultAsync } from 'neverthrow';

export const FREE_MONTHLY_LINE_MESSAGES = 100;

export interface MonthlyUsage {
  used: number;
  limit: number;
  remaining: number;
}

export type AllowanceError = { type: 'database'; cause: unknown };

/**
 * Get the photographer's LINE message usage for the current calendar month.
 */
export function getMonthlyUsage(
  db: Database,
  photographerId: string,
): ResultAsync<MonthlyUsage, AllowanceError> {
  return ResultAsync.fromPromise(
    (async () => {
      const startOfMonth = new Date();
      startOfMonth.setUTCDate(1);
      startOfMonth.setUTCHours(0, 0, 0, 0);

      const [result] = await db
        .select({
          totalMessages: sql<number>`coalesce(sum(${lineDeliveries.messageCount}), 0)::int`,
        })
        .from(lineDeliveries)
        .where(
          sql`${lineDeliveries.photographerId} = ${photographerId}
            AND ${lineDeliveries.createdAt} >= ${startOfMonth.toISOString()}`,
        );

      const used = result?.totalMessages ?? 0;
      const remaining = Math.max(0, FREE_MONTHLY_LINE_MESSAGES - used);

      return { used, limit: FREE_MONTHLY_LINE_MESSAGES, remaining };
    })(),
    (cause): AllowanceError => ({ type: 'database', cause }),
  );
}
