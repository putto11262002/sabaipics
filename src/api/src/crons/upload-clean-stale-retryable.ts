import { createDb, uploadIntents, photos } from '@/db';
import { and, eq, lt } from 'drizzle-orm';
import type { Bindings } from '../types';

const BATCH_SIZE = 100;

/**
 * Hard deletes retryable failed upload intents older than 7 days.
 * These are intents (e.g. insufficient_credits) that the user never acted on.
 * Removes: R2 object + associated photo record (if any) + upload intent record.
 *
 * Schedule: 20 23 * * * (6:20 AM Bangkok)
 */
export async function cleanupStaleRetryable(env: Bindings): Promise<void> {
  const startTime = Date.now();
  const db = createDb(env.DATABASE_URL);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const intents = await db
    .select({
      id: uploadIntents.id,
      r2Key: uploadIntents.r2Key,
      photoId: uploadIntents.photoId,
      eventId: uploadIntents.eventId,
    })
    .from(uploadIntents)
    .where(
      and(
        eq(uploadIntents.status, 'failed'),
        eq(uploadIntents.retryable, true),
        lt(uploadIntents.createdAt, cutoff.toISOString()),
      ),
    )
    .limit(BATCH_SIZE);

  if (intents.length === 0) {
    console.log('[UploadIntentCleanup] No stale retryable intents to clean up');
    return;
  }

  let deleted = 0;
  let failed = 0;

  for (const intent of intents) {
    try {
      // Delete R2 objects first — if these fail, skip intent deletion so
      // the next cron run can retry (prevents orphaning R2 objects).
      if (intent.r2Key) {
        await env.PHOTOS_BUCKET.delete(intent.r2Key);
      }
      if (intent.photoId) {
        const normalizedKey = `${intent.eventId}/${intent.photoId}.jpg`;
        await env.PHOTOS_BUCKET.delete(normalizedKey);
      }

      // Delete associated photo record if any
      if (intent.photoId) {
        await db.delete(photos).where(eq(photos.id, intent.photoId));
      }

      // Delete the upload intent record (only after R2 + photo cleanup succeeds)
      await db.delete(uploadIntents).where(eq(uploadIntents.id, intent.id));

      deleted++;
    } catch (error) {
      failed++;
      console.error('[UploadIntentCleanup] Failed to clean stale retryable intent', {
        intentId: intent.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[UploadIntentCleanup] Stale retryable cleanup done', {
    processed: intents.length,
    deleted,
    failed,
    durationMs: Date.now() - startTime,
  });
}
