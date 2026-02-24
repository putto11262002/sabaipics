/**
 * Hard Delete Event Service
 *
 * Permanently deletes an event and all related data:
 * - Database: 7 tables (faces, photos, participants, uploads, ftp, event)
 * - R2: Photos, logos, QR codes, selfies
 * - AWS: Rekognition collection
 *
 * WARNING: This is irreversible. Only use in development or for cleanup.
 */

import type { DatabaseTx } from '@/db';
import {
  events,
  photos,
  faces,
  participantSearches,
  uploadIntents,
  logoUploadIntents,
  ftpCredentials,
} from '@/db';
import { eq, inArray } from 'drizzle-orm';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { EventServiceError } from '../error';
import { databaseError, storageFailed } from '../error';

export interface HardDeleteResult {
  success: boolean;
  eventId: string;
  error?: EventServiceError; // Present when success = false
  deleted: {
    database: {
      faces: number;
      photos: number;
      participantSearches: number;
      uploadIntents: number;
      logoUploadIntents: number;
      ftpCredentials: number;
      events: number;
    };
    r2Objects: number;
    rekognitionCollection: boolean;
  };
}

export interface HardDeleteEventsOptions {
  db: DatabaseTx; // Requires WebSocket adapter for transaction support
  eventIds: string[];
  r2Bucket: R2Bucket;
  deleteRekognition: (collectionId: string) => Promise<void>;
}

/**
 * Hard delete multiple events and all related data in parallel.
 *
 * Public API that takes event IDs and looks up event details internally.
 * Use this for both single-event (HTTP route) and batch (cron) deletions.
 *
 * Order of operations (per event, all in ONE transaction):
 * 1. Collect R2 keys and delete database records atomically (transaction)
 * 2. Delete R2 objects (parallel, best effort)
 * 3. Delete Rekognition collection (best effort)
 *
 * Events are deleted in parallel using Promise.allSettled for optimal performance.
 * Returns Ok with array of results (may include failures). Only returns Err if
 * the entire operation cannot proceed (e.g., database connection failure).
 *
 * IMPORTANT: Must pass DatabaseTx (use c.var.dbTx() or createDbTx()) for transaction support.
 */
export function hardDeleteEvents(
  options: HardDeleteEventsOptions,
): ResultAsync<HardDeleteResult[], EventServiceError> {
  const { db, eventIds, r2Bucket, deleteRekognition } = options;

  // Validate batch size to prevent performance issues
  if (eventIds.length === 0) {
    return okAsync([]);
  }

  if (eventIds.length > 100) {
    return errAsync({
      type: 'custom',
      code: 'BATCH_TOO_LARGE',
      message: `Cannot delete more than 100 events at once. Received ${eventIds.length}`,
      retryable: false,
      context: { eventId: 'batch' },
    });
  }

  // Query events to get rekognitionCollectionId for each
  return ResultAsync.fromPromise(
    db
      .select({
        id: events.id,
        rekognitionCollectionId: events.rekognitionCollectionId,
      })
      .from(events)
      .where(inArray(events.id, eventIds)),
    (error) => databaseError('query_events', error, { eventId: eventIds[0] || 'batch' }),
  ).andThen((eventDetails) =>
    ResultAsync.fromPromise(
      // Delete all events in parallel (optimized for bulk operations)
      // Each event deletion is atomic (one transaction per event)
      Promise.allSettled(
        eventDetails.map(async (event): Promise<HardDeleteResult> => {
          const eventId = event.id;
          const rekognitionCollectionId = event.rekognitionCollectionId;

          // Use ResultAsync for proper error handling (no try-catch)
          const result = await ResultAsync.fromPromise(
            // ONE transaction for database operations + R2 key collection
            db.transaction(async (tx) => {
              // Step 1: Collect R2 keys INSIDE transaction (prevents race condition)
              const [eventPhotos, eventSearches, eventData] = await Promise.all([
                tx
                  .select({ r2Key: photos.r2Key, id: photos.id })
                  .from(photos)
                  .where(eq(photos.eventId, eventId)),

                tx
                  .select({ selfieR2Key: participantSearches.selfieR2Key })
                  .from(participantSearches)
                  .where(eq(participantSearches.eventId, eventId)),

                tx
                  .select({
                    logoR2Key: events.logoR2Key,
                    qrCodeR2Key: events.qrCodeR2Key,
                  })
                  .from(events)
                  .where(eq(events.id, eventId))
                  .limit(1)
                  .then((rows) => rows[0]),
              ]);

              // Collect all R2 keys (filter out nulls)
              const r2Keys = [
                eventData?.logoR2Key,
                eventData?.qrCodeR2Key,
                ...eventPhotos.map((p) => p.r2Key),
                ...eventSearches.map((s) => s.selfieR2Key),
              ].filter((key): key is string => Boolean(key));

              // Step 2: Delete from database in dependency order (all FKs are RESTRICT)
              const photoIdList = eventPhotos.map((p) => p.id);

              const facesDeleted =
                photoIdList.length > 0
                  ? await tx
                      .delete(faces)
                      .where(inArray(faces.photoId, photoIdList))
                      .returning({ id: faces.id })
                  : [];

              const photosDeleted = await tx
                .delete(photos)
                .where(eq(photos.eventId, eventId))
                .returning({ id: photos.id });

              const searchesDeleted = await tx
                .delete(participantSearches)
                .where(eq(participantSearches.eventId, eventId))
                .returning({ id: participantSearches.id });

              const uploadsDeleted = await tx
                .delete(uploadIntents)
                .where(eq(uploadIntents.eventId, eventId))
                .returning({ id: uploadIntents.id });

              const logoUploadsDeleted = await tx
                .delete(logoUploadIntents)
                .where(eq(logoUploadIntents.eventId, eventId))
                .returning({ id: logoUploadIntents.id });

              const ftpDeleted = await tx
                .delete(ftpCredentials)
                .where(eq(ftpCredentials.eventId, eventId))
                .returning({ id: ftpCredentials.id });

              const eventsDeleted = await tx
                .delete(events)
                .where(eq(events.id, eventId))
                .returning({ id: events.id });

              return {
                dbCounts: {
                  faces: facesDeleted.length,
                  photos: photosDeleted.length,
                  participantSearches: searchesDeleted.length,
                  uploadIntents: uploadsDeleted.length,
                  logoUploadIntents: logoUploadsDeleted.length,
                  ftpCredentials: ftpDeleted.length,
                  events: eventsDeleted.length,
                },
                r2Keys,
              };
            }),
            (error) => databaseError('hard_delete', error, { eventId }),
          )
            .andThen(({ dbCounts, r2Keys }) =>
              // Step 3: Delete R2 objects (best effort - don't fail if R2 delete fails)
              ResultAsync.fromPromise(
                r2Keys.length > 0
                  ? Promise.allSettled(r2Keys.map((key) => r2Bucket.delete(key))).then(
                      (results) => {
                        const successCount = results.filter((r) => r.status === 'fulfilled').length;
                        const failedCount = results.length - successCount;

                        if (failedCount > 0) {
                          console.warn('[HardDelete] Some R2 deletions failed (non-fatal)', {
                            eventId,
                            total: r2Keys.length,
                            succeeded: successCount,
                            failed: failedCount,
                          });
                        }

                        return successCount;
                      },
                    )
                  : Promise.resolve(0),
                (error) => storageFailed('delete', error, { eventId }),
              )
                .orElse((error) => {
                  // R2 failure is non-fatal, log and continue with 0 count
                  console.warn('[HardDelete] R2 deletion failed (non-fatal)', {
                    eventId,
                    error: error.type,
                  });
                  return okAsync(0);
                })
                .map((r2Count) => ({ dbCounts, r2Count })),
            )
            .andThen(({ dbCounts, r2Count }) =>
              // Step 4: Delete Rekognition collection (best effort)
              ResultAsync.fromPromise(
                rekognitionCollectionId
                  ? deleteRekognition(rekognitionCollectionId).then(() => {
                      console.log('[HardDelete] Rekognition collection deleted', {
                        eventId,
                        collectionId: rekognitionCollectionId,
                      });
                      return true;
                    })
                  : Promise.resolve(false),
                (error) => {
                  console.warn('[HardDelete] Rekognition deletion failed (non-fatal)', {
                    eventId,
                    collectionId: rekognitionCollectionId,
                    error: error instanceof Error ? error.message : String(error),
                  });
                  // Return false as error value (will be converted to Ok(false) by orElse)
                  return error;
                },
              )
                .orElse(() => okAsync(false)) // Convert any error to success with false
                .map((rekognitionDeleted) => ({
                  success: true as const,
                  eventId,
                  deleted: {
                    database: dbCounts,
                    r2Objects: r2Count,
                    rekognitionCollection: rekognitionDeleted,
                  },
                })),
            );

          // Convert Result to HardDeleteResult (handle both success and error)
          return result.match(
            (success) => success,
            (error) => {
              console.error('[HardDelete] Event deletion failed', {
                eventId,
                error: error.type,
              });

              return {
                success: false as const,
                eventId,
                error,
                deleted: {
                  database: {
                    faces: 0,
                    photos: 0,
                    participantSearches: 0,
                    uploadIntents: 0,
                    logoUploadIntents: 0,
                    ftpCredentials: 0,
                    events: 0,
                  },
                  r2Objects: 0,
                  rekognitionCollection: false,
                },
              };
            },
          );
        }),
      ).then((deletionResults) => {
        // Map Promise.allSettled results to HardDeleteResult[]
        return deletionResults.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            // Unexpected rejection (shouldn't happen with our error handling)
            const eventId = eventDetails[index]?.id || eventIds[index] || 'batch';
            console.error('[HardDelete] Unexpected deletion failure', {
              eventId,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });

            return {
              success: false as const,
              eventId,
              error: {
                type: 'custom' as const,
                code: 'UNEXPECTED_ERROR',
                message:
                  result.reason instanceof Error ? result.reason.message : String(result.reason),
                retryable: false,
                context: { eventId },
              },
              deleted: {
                database: {
                  faces: 0,
                  photos: 0,
                  participantSearches: 0,
                  uploadIntents: 0,
                  logoUploadIntents: 0,
                  ftpCredentials: 0,
                  events: 0,
                },
                r2Objects: 0,
                rekognitionCollection: false,
              },
            };
          }
        });
      }),
      (error) => databaseError('batch_delete', error, { eventId: eventIds[0] || 'batch' }),
    ),
  );
}
