import { createDb, uploadIntents } from '@/db';
import { and, eq, type SQL } from 'drizzle-orm';
import type { Bindings } from '../../../types';
import type { R2EventMessage } from '../../../types/r2-event';

/**
 * Reprocesses upload intents that failed with `insufficient_credits`
 * after the photographer tops up credits.
 *
 * For each retryable intent:
 * 1. Verify R2 object still exists (HEAD)
 * 2. Reset intent to `pending` (clear error fields)
 * 3. Send synthetic R2 event to UPLOAD_QUEUE
 * 4. If R2 object missing → hard delete the intent (already cleaned up)
 */
export async function reprocessInsufficientCredits(
  env: Bindings,
  photographerId: string,
): Promise<{ requeued: number; cleaned: number; failed: number }> {
  return reprocessInsufficientCreditsIntents(env, photographerId, []);
}

export async function reprocessInsufficientCreditsForEvent(
  env: Bindings,
  photographerId: string,
  eventId: string,
): Promise<{ found: number; requeued: number; cleaned: number; failed: number }> {
  const result = await reprocessInsufficientCreditsIntents(env, photographerId, [
    eq(uploadIntents.eventId, eventId),
  ]);
  return { found: result.found, requeued: result.requeued, cleaned: result.cleaned, failed: result.failed };
}

export async function reprocessInsufficientCreditsForIntent(
  env: Bindings,
  photographerId: string,
  eventId: string,
  intentId: string,
): Promise<{ found: number; requeued: number; cleaned: number; failed: number }> {
  const result = await reprocessInsufficientCreditsIntents(env, photographerId, [
    eq(uploadIntents.eventId, eventId),
    eq(uploadIntents.id, intentId),
  ]);
  return { found: result.found, requeued: result.requeued, cleaned: result.cleaned, failed: result.failed };
}

async function reprocessInsufficientCreditsIntents(
  env: Bindings,
  photographerId: string,
  extraConditions: SQL[],
): Promise<{ found: number; requeued: number; cleaned: number; failed: number }> {
  const db = createDb(env.DATABASE_URL);

  const intents = await db
    .select({
      id: uploadIntents.id,
      r2Key: uploadIntents.r2Key,
      eventId: uploadIntents.eventId,
    })
    .from(uploadIntents)
    .where(
      and(
        eq(uploadIntents.photographerId, photographerId),
        eq(uploadIntents.status, 'failed'),
        eq(uploadIntents.retryable, true),
        eq(uploadIntents.errorCode, 'insufficient_credits'),
        ...extraConditions,
      ),
    );

  if (intents.length === 0) {
    return { found: 0, requeued: 0, cleaned: 0, failed: 0 };
  }

  console.log(
    `[Reprocess] Found ${intents.length} retryable intents for photographer ${photographerId}`,
  );

  let requeued = 0;
  let cleaned = 0;
  let failed = 0;

  for (const intent of intents) {
    try {
      // Verify R2 object still exists
      const head = await env.PHOTOS_BUCKET.head(intent.r2Key);

      if (!head) {
        // R2 object already gone (cron cleaned it up) — delete the orphaned intent
        await db.delete(uploadIntents).where(eq(uploadIntents.id, intent.id));
        cleaned++;
        continue;
      }

      // Send synthetic R2 event to upload queue BEFORE updating intent —
      // if queue send fails, intent stays in failed/retryable for next top-up.
      const syntheticEvent: R2EventMessage = {
        account: '',
        action: 'PutObject',
        bucket: env.PHOTO_BUCKET_NAME,
        object: {
          key: intent.r2Key,
          size: head.size,
          eTag: head.etag,
        },
        eventTime: new Date().toISOString(),
      };

      await env.UPLOAD_QUEUE.send(syntheticEvent);

      // Queue send succeeded — now reset intent to pending with fresh expiry
      await db
        .update(uploadIntents)
        .set({
          status: 'pending',
          errorCode: null,
          errorMessage: null,
          retryable: null,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .where(eq(uploadIntents.id, intent.id));

      requeued++;
    } catch (error) {
      failed++;
      console.error('[Reprocess] Failed to reprocess intent', {
        intentId: intent.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[Reprocess] Reprocessing complete', {
    photographerId,
    total: intents.length,
    requeued,
    cleaned,
    failed,
  });

  return { found: intents.length, requeued, cleaned, failed };
}
