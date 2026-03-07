import { createDb, createDbTx, photoJobs, uploadIntents } from '@/db';
import { and, eq, lt } from 'drizzle-orm';
import type { Bindings } from '../types';
import type { CreditRefundMessage } from '../types/credit-queue';

const BATCH_SIZE = 100;
const STUCK_THRESHOLD_MINUTES = 30;

/**
 * Recovers photo_jobs stuck in `submitted` for >30 minutes.
 * This happens when Modal's callback fails (network error, orchestrator crash, etc.).
 *
 * For each stuck job:
 * 1. Refund all pre-debited credits
 * 2. Mark photo_job → failed (retryable: true)
 * 3. Mark upload_intent → failed (retryable: true)
 *
 * The user can then retry via the dashboard, which re-enqueues to PHOTO_PIPELINE_QUEUE.
 *
 * Schedule: 50 23 * * * (6:50 AM Bangkok)
 */
export async function cleanupStuckSubmitted(env: Bindings): Promise<void> {
  const startTime = Date.now();
  const db = createDb(env.DATABASE_URL);
  const dbTx = createDbTx(env.DATABASE_URL);

  const cutoff = new Date();
  cutoff.setMinutes(cutoff.getMinutes() - STUCK_THRESHOLD_MINUTES);

  const stuckJobs = await db
    .select({
      id: photoJobs.id,
      uploadIntentId: photoJobs.uploadIntentId,
      photographerId: photoJobs.photographerId,
      creditsDebited: photoJobs.creditsDebited,
      creditsRefunded: photoJobs.creditsRefunded,
    })
    .from(photoJobs)
    .where(
      and(
        eq(photoJobs.status, 'submitted'),
        lt(photoJobs.updatedAt, cutoff.toISOString()),
      ),
    )
    .limit(BATCH_SIZE);

  if (stuckJobs.length === 0) {
    console.log('[PipelineCleanup] No stuck submitted jobs');
    return;
  }

  let recovered = 0;
  let failed = 0;

  for (const job of stuckJobs) {
    try {
      const refundable = Math.max(0, (job.creditsDebited ?? 0) - (job.creditsRefunded ?? 0));
      const now = new Date().toISOString();

      await dbTx.transaction(async (tx) => {
        // Mark photo_job failed + retryable
        await tx
          .update(photoJobs)
          .set({
            status: 'failed',
            errorCode: 'callback_timeout',
            errorMessage: `Job stuck in submitted for >${STUCK_THRESHOLD_MINUTES} minutes`,
            retryable: true,
            creditsRefunded: job.creditsDebited,
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(photoJobs.id, job.id));

        // Mark upload_intent failed + retryable
        await tx
          .update(uploadIntents)
          .set({
            status: 'failed',
            errorCode: 'callback_timeout',
            errorMessage: 'Pipeline callback not received',
            retryable: true,
          })
          .where(eq(uploadIntents.id, job.uploadIntentId));
      });

      // Send refund to credit queue after transaction commits
      if (refundable > 0) {
        await env.CREDIT_QUEUE.send({
          type: 'refund',
          photographerId: job.photographerId,
          amount: refundable,
          source: 'refund',
          reason: 'callback_timeout',
        } satisfies CreditRefundMessage);
      }

      recovered++;
    } catch (error) {
      failed++;
      console.error('[PipelineCleanup] Failed to recover stuck job', {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[PipelineCleanup] Stuck submitted cleanup done', {
    processed: stuckJobs.length,
    recovered,
    failed,
    durationMs: Date.now() - startTime,
  });
}
