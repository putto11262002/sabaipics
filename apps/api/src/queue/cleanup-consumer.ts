/**
 * Cleanup Queue Consumer
 *
 * Handles rekognition-cleanup queue messages:
 * - Soft-delete photos (set deletedAt)
 * - Delete face recognition collection
 * - Clear rekognitionCollectionId from event
 *
 * Idempotent: ResourceNotFoundException treated as success.
 */

import type { CleanupJob } from '../types/cleanup-job';
import type { Bindings } from '../types';
import { createDb, events, photos } from '@sabaipics/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  createFaceProvider,
  isResourceNotFoundError,
  getBackoffDelay,
  getThrottleBackoffDelay,
  type FaceServiceError,
} from '../lib/rekognition';
import { ResultAsync, ok, err, safeTry } from 'neverthrow';

// =============================================================================
// Types
// =============================================================================

type CleanupError =
  | { type: 'event_not_found'; eventId: string }
  | { type: 'database'; operation: string; cause: unknown }
  | { type: 'face_service'; retryable: boolean; throttle: boolean; cause: FaceServiceError };

// =============================================================================
// Queue Handler
// =============================================================================

export async function queue(batch: MessageBatch<CleanupJob>, env: Bindings): Promise<void> {
  if (batch.messages.length === 0) return;

  console.log('[Cleanup] Batch start', { size: batch.messages.length });

  const db = createDb(env.DATABASE_URL);
  const provider = createFaceProvider(env);

  for (const message of batch.messages) {
    const { event_id } = message.body;

    await safeTry(async function* () {
      // 1. Get event state
      const state = yield* ResultAsync.fromPromise(
        db
          .select({
            hasPhotosNotDeleted: sql<boolean>`EXISTS(SELECT 1 FROM ${photos} WHERE ${photos.eventId} = ${event_id} AND ${photos.deletedAt} IS NULL)`,
            collectionId: events.rekognitionCollectionId,
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
      let collectionDeleted = false;

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

      // 3. Delete collection + clear DB reference
      if (state.collectionId) {
        collectionDeleted = yield* provider.deleteCollection(event_id)
          .map(() => true)
          .orElse((faceErr) => {
            // Handle ResourceNotFoundException (already deleted) - treat as success
            if (faceErr.type === 'provider_failed' && faceErr.provider === 'aws') {
              const awsErr = faceErr as Extract<FaceServiceError, { provider: 'aws' }>;
              if (isResourceNotFoundError(awsErr.errorName)) {
                return ok(false);
              }
            }
            return err<boolean, CleanupError>({
              type: 'face_service',
              retryable: faceErr.retryable,
              throttle: faceErr.throttle,
              cause: faceErr,
            });
          })
          .andThen((deleted) =>
            ResultAsync.fromPromise(
              db
                .update(events)
                .set({ rekognitionCollectionId: null })
                .where(eq(events.id, event_id))
                .then(() => deleted),
              (cause): CleanupError => ({ type: 'database', operation: 'clear_collection', cause }),
            ),
          );
      }

      return ok({ eventId: event_id, photosDeleted, collectionDeleted });
    })
      .orTee((e) => console.error('[Cleanup] Failed:', { eventId: event_id, error: e }))
      .match(
        (summary) => {
          console.log('[Cleanup] Success', summary);
          message.ack();
        },
        (error) => {
          const { retryable, throttle } =
            error.type === 'face_service'
              ? error
              : { retryable: error.type === 'database', throttle: false };

          if (!retryable) {
            message.ack();
            return;
          }

          message.retry({
            delaySeconds: throttle
              ? getThrottleBackoffDelay(message.attempts)
              : getBackoffDelay(message.attempts),
          });
        },
      );
  }

  console.log('[Cleanup] Batch complete', { size: batch.messages.length });
}
