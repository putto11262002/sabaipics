import { createDb, uploadIntents } from '@/db';
import { and, eq, lt, or } from 'drizzle-orm';
import type { Bindings } from '../types';

const BATCH_SIZE = 100;

/**
 * Transitions stale pending/processing upload intents to `expired` after 7 days.
 * Covers two stuck scenarios:
 *   (a) Worker crash — error handler never ran, intent stuck in `pending` or `processing`
 *   (b) Client got presign but never uploaded — no R2 event fired
 *
 * Uses `createdAt` (not `expiresAt`) because clients can re-presign a pending
 * intent days later via POST /uploads/:uploadId/presign, resetting expiry.
 *
 * Hard deletion of the expired intent + R2 object is handled by Cron 2
 * (cleanupNonRetryableFailed) after 3 more days.
 *
 * Schedule: 30 23 * * * (6:30 AM Bangkok)
 */
export async function expireStalePendingIntents(env: Bindings): Promise<void> {
  const startTime = Date.now();
  const db = createDb(env.DATABASE_URL);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const intents = await db
    .select({ id: uploadIntents.id })
    .from(uploadIntents)
    .where(
      and(
        or(eq(uploadIntents.status, 'pending'), eq(uploadIntents.status, 'processing')),
        lt(uploadIntents.createdAt, cutoff.toISOString()),
      ),
    )
    .limit(BATCH_SIZE);

  if (intents.length === 0) {
    console.log('[UploadIntentCleanup] No stale pending intents to expire');
    return;
  }

  let expired = 0;
  let failed = 0;

  for (const intent of intents) {
    try {
      // Compare-and-set: only expire if still pending/processing (prevents overwriting
      // a concurrent completed/failed transition from the upload consumer).
      await db
        .update(uploadIntents)
        .set({ status: 'expired' })
        .where(
          and(
            eq(uploadIntents.id, intent.id),
            or(eq(uploadIntents.status, 'pending'), eq(uploadIntents.status, 'processing')),
          ),
        );

      expired++;
    } catch (error) {
      failed++;
      console.error('[UploadIntentCleanup] Failed to expire stale pending intent', {
        intentId: intent.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[UploadIntentCleanup] Stale pending expiry done', {
    processed: intents.length,
    expired,
    failed,
    durationMs: Date.now() - startTime,
  });
}
