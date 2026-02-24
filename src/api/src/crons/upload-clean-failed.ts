import { createDb, uploadIntents, photos } from '@/db';
import { and, eq, lt, or } from 'drizzle-orm';
import type { Bindings } from '../types';

const BATCH_SIZE = 100;

/**
 * Hard deletes non-retryable failed and expired upload intents older than 3 days.
 * Removes: R2 object + associated photo record (if any) + upload intent record.
 *
 * Schedule: 10 23 * * * (6:10 AM Bangkok)
 */
export async function cleanupNonRetryableFailed(env: Bindings): Promise<void> {
  const startTime = Date.now();
  const db = createDb(env.DATABASE_URL);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);

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
        or(
          // Non-retryable failures
          and(eq(uploadIntents.status, 'failed'), eq(uploadIntents.retryable, false)),
          // Expired intents
          eq(uploadIntents.status, 'expired'),
        ),
        lt(uploadIntents.createdAt, cutoff.toISOString()),
      ),
    )
    .limit(BATCH_SIZE);

  if (intents.length === 0) {
    console.log('[UploadIntentCleanup] No non-retryable failed intents to clean up');
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
      console.error('[UploadIntentCleanup] Failed to clean non-retryable intent', {
        intentId: intent.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[UploadIntentCleanup] Non-retryable failed cleanup done', {
    processed: intents.length,
    deleted,
    failed,
    durationMs: Date.now() - startTime,
  });
}
