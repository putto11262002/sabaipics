import { createDb, uploadIntents } from '@/db';
import { and, eq, lt, or } from 'drizzle-orm';
import type { Bindings } from '../types';
import { hardDeleteUploadIntents } from '../lib/services/uploads/hard-delete-intents';

const BATCH_SIZE = 100;

/**
 * Hard deletes non-retryable failed and expired upload intents older than 3 days.
 * Removes: R2 objects (raw upload + V2 normalized/processed) + photo_job +
 *          photo record (if any) + upload intent record.
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

  const { deleted, failed } = await hardDeleteUploadIntents(db, env.PHOTOS_BUCKET, intents);

  console.log('[UploadIntentCleanup] Non-retryable failed cleanup done', {
    processed: intents.length,
    deleted,
    failed,
    durationMs: Date.now() - startTime,
  });
}
