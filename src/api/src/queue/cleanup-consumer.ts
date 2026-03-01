/**
 * Cleanup Queue Consumer
 *
 * Handles rekognition-cleanup queue messages:
 * - Soft-delete photos (set deletedAt)
 *
 * Face embeddings are cascade-deleted when photos are hard-deleted
 * (ON DELETE CASCADE on face_embeddings.photo_id FK).
 * No external service calls needed.
 */

import type { CleanupJob } from '../types/cleanup-job';
import type { Bindings } from '../types';
import { createDb, events, photos } from '@/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getBackoffDelay } from '../utils/backoff';
import { ResultAsync, ok, err, safeTry } from 'neverthrow';

// =============================================================================
// Types
// =============================================================================

type CleanupError =
  | { type: 'event_not_found'; eventId: string }
  | { type: 'database'; operation: string; cause: unknown };

// =============================================================================
// Queue Handler
// =============================================================================

export async function queue(batch: MessageBatch<CleanupJob>, env: Bindings): Promise<void> {
  if (batch.messages.length === 0) return;

  console.log('[Cleanup] Batch start', { size: batch.messages.length });

  const db = createDb(env.DATABASE_URL);

  for (const message of batch.messages) {
    const { event_id } = message.body;

    await safeTry(async function* () {
      // 1. Get event state
      const state = yield* ResultAsync.fromPromise(
        db
          .select({
            hasPhotosNotDeleted: sql<boolean>`EXISTS(SELECT 1 FROM ${photos} WHERE ${photos.eventId} = ${event_id} AND ${photos.deletedAt} IS NULL)`,
          })
          .from(events)
          .where(eq(events.id, event_id))
          .limit(1)
          .then((rows) => rows[0]),
        (cause): CleanupError => ({ type: 'database', operation: 'get_state', cause }),
      ).andThen((s) =>
        s ? ok(s) : err<never, CleanupError>({ type: 'event_not_found', eventId: event_id }),
      );

      let photosDeleted = 0;

      // 2. Soft-delete photos if any remain
      if (state.hasPhotosNotDeleted) {
        photosDeleted = yield* ResultAsync.fromPromise(
          db
            .update(photos)
            .set({ deletedAt: new Date().toISOString() })
            .where(and(eq(photos.eventId, event_id), isNull(photos.deletedAt)))
            .returning({ id: photos.id })
            .then((rows) => rows.length),
          (cause): CleanupError => ({ type: 'database', operation: 'soft_delete', cause }),
        );
      }

      return ok({ eventId: event_id, photosDeleted });
    })
      .orTee((e) => console.error('[Cleanup] Failed:', { eventId: event_id, error: e }))
      .match(
        (summary) => {
          console.log('[Cleanup] Success', summary);
          message.ack();
        },
        (error) => {
          const retryable = error.type === 'database';

          if (!retryable) {
            message.ack();
            return;
          }

          message.retry({
            delaySeconds: getBackoffDelay(message.attempts),
          });
        },
      );
  }

  console.log('[Cleanup] Batch complete', { size: batch.messages.length });
}
