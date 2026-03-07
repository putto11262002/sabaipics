import { createDb, uploadIntents } from '@/db';
import { and, eq, lt } from 'drizzle-orm';
import type { Bindings } from '../types';
import { hardDeleteUploadIntents } from '../lib/services/uploads/hard-delete-intents';

const BATCH_SIZE = 100;

/**
 * Hard deletes retryable failed upload intents older than 7 days.
 * These are intents (e.g. insufficient_credits) that the user never acted on.
 * Removes: R2 objects (raw upload + V2 normalized/processed) + photo_job +
 *          photo record (if any) + upload intent record.
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

  const { deleted, failed } = await hardDeleteUploadIntents(db, env.PHOTOS_BUCKET, intents);

  console.log('[UploadIntentCleanup] Stale retryable cleanup done', {
    processed: intents.length,
    deleted,
    failed,
    durationMs: Date.now() - startTime,
  });
}
