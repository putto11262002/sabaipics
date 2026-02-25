import { createDb, photographers } from '@/db';
import { and, isNotNull, lte, sql } from 'drizzle-orm';
import { recomputeBalanceCache } from '../lib/credits';
import type { Bindings } from '../types';

interface ReconcileResult {
  stalePhotographers: number;
  reconciled: number;
  failed: number;
}

/**
 * Recompute credit balance cache for photographers whose invalidate timestamp has passed.
 */
export async function reconcileStaleCreditBalances(env: Bindings): Promise<ReconcileResult> {
  const startedAt = Date.now();
  const batchSize = env.CLEANUP_BATCH_SIZE ? parseInt(env.CLEANUP_BATCH_SIZE, 10) : 10;

  const db = createDb(env.DATABASE_URL);
  const stale = await db
    .select({ id: photographers.id })
    .from(photographers)
    .where(
      and(
        isNotNull(photographers.balanceInvalidateAt),
        lte(photographers.balanceInvalidateAt, sql`NOW()`),
      ),
    )
    .limit(batchSize);

  if (stale.length === 0) {
    console.log('[CreditsCron] No stale balances to reconcile');
    return { stalePhotographers: 0, reconciled: 0, failed: 0 };
  }

  let reconciled = 0;
  let failed = 0;

  for (const row of stale) {
    const result = await recomputeBalanceCache(db, row.id).match(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );

    if (result.ok) {
      reconciled += 1;
      continue;
    }

    failed += 1;
    console.error('[CreditsCron] Failed to reconcile stale balance', {
      photographerId: row.id,
      cause: result.error.cause,
    });
  }

  console.log('[CreditsCron] Reconcile completed', {
    stalePhotographers: stale.length,
    reconciled,
    failed,
    durationMs: Date.now() - startedAt,
  });

  return { stalePhotographers: stale.length, reconciled, failed };
}
