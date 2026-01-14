/**
 * Photo Processing Queue Consumer
 *
 * Handles photo-processing queue messages with:
 * - Rate limiting via Durable Object (RPC)
 * - Parallel request execution with paced initiation (20ms intervals)
 * - Per-message ack/retry based on individual results
 *
 * Infrastructure layer:
 * - Fetches image from R2
 * - Calls Rekognition IndexFaces
 * - Returns SDK types (FaceRecord[], UnindexedFace[])
 *
 * Application layer (NOT here) handles:
 * - Saving faces to DB
 * - Updating photo status
 * - WebSocket notifications
 */

import type { PhotoJob } from '../types/photo-job';
import type { Bindings } from '../types';
import {
  createRekognitionClient,
  createCollectionSafe,
  indexFacesSafe,
  getCollectionId,
  type AWSRekognitionError,
  type IndexFacesResult,
  getBackoffDelay,
  getThrottleBackoffDelay,
} from '../lib/rekognition';
import { RekognitionClient } from '@aws-sdk/client-rekognition';
import { sleep } from '../utils/async';
import { createDb, createDbTx, type Database, type DatabaseTx } from '@sabaipics/db';
import { photos, events, faces } from '@sabaipics/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import { ResultAsync, ok, err, safeTry, type Result } from 'neverthrow';

// =============================================================================
// Types
// =============================================================================

/**
 * Photo processing error - discriminated union for this layer.
 * Translates lower-level errors into domain-specific types.
 */
export type PhotoProcessingError =
  | { type: 'not_found'; resource: 'r2_image'; key: string }
  | { type: 'database'; operation: string; cause: unknown }
  | { type: 'rekognition'; cause: AWSRekognitionError }
  | { type: 'transform'; message: string; cause: unknown };

/**
 * Result of processing a single photo.
 * Associates the message with its Result.
 */
interface ProcessedPhoto {
  message: Message<PhotoJob>;
  result: Result<IndexFacesResult, PhotoProcessingError>;
}

// =============================================================================
// Image Transformation
// =============================================================================

/**
 * Transform image to meet Rekognition size requirements.
 *
 * Uses Cloudflare Images API binding for optimized image transformation:
 * - Resize to max 4096x4096 (maintains aspect ratio)
 * - JPEG encoding at quality 85
 *
 * @param env - Cloudflare bindings (includes IMAGES binding)
 * @param imageBytes - Original image as ArrayBuffer
 * @returns ResultAsync with transformed image or PhotoProcessingError
 */
function transformImageForRekognition(
  env: Bindings,
  imageBytes: ArrayBuffer,
): ResultAsync<ArrayBuffer, PhotoProcessingError> {
  return ResultAsync.fromPromise(
    (async () => {
      // Convert ArrayBuffer to ReadableStream for CF Images API
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(imageBytes));
          controller.close();
        },
      });

      // Transform using CF Images API
      const response = await env.IMAGES.input(stream)
        .transform({ width: 4096, height: 4096 })
        .output({ format: 'image/jpeg', quality: 85 });

      // Get the transformed image as ArrayBuffer
      return await response.response().arrayBuffer();
    })(),
    (cause): PhotoProcessingError => ({
      type: 'transform',
      message: 'Failed to transform image via CF Images API',
      cause,
    }),
  );
}

// =============================================================================
// Database Persistence
// =============================================================================

/**
 * Persist faces to database and update photo status to 'indexed'.
 *
 * Uses transaction to ensure atomicity:
 * - Insert face records
 * - Update photo status and face_count
 * - Update event counts (photo_count, face_count)
 *
 * @param dbTx - Transactional database instance (WebSocket adapter)
 * @param db - Non-transactional database instance (for pre-transaction checks)
 * @param job - Photo job from queue
 * @param data - IndexFaces result from Rekognition
 * @param client - Rekognition client for collection creation
 * @returns ResultAsync<void, PhotoProcessingError>
 */
function persistFacesAndUpdatePhoto(
  dbTx: DatabaseTx,
  db: Database,
  job: PhotoJob,
  data: IndexFacesResult,
  client: RekognitionClient,
): ResultAsync<void, PhotoProcessingError> {
  return safeTry(async function* () {
    // PRE-STEP: Ensure collection exists (outside transaction - uses Rekognition API)
    const event = yield* ResultAsync.fromPromise(
      db
        .select({ collectionId: events.rekognitionCollectionId })
        .from(events)
        .where(eq(events.id, job.event_id))
        .limit(1)
        .then((rows) => rows[0]),
      (cause): PhotoProcessingError => ({ type: 'database', operation: 'select_event', cause }),
    );

    if (!event.collectionId) {
      // Create collection using safe wrapper, handle ResourceAlreadyExistsException
      const createResult = yield* createCollectionSafe(client, job.event_id)
        .orElse((rekErr) => {
          // Handle AlreadyExistsException (race condition) - treat as success
          if (rekErr.name === 'ResourceAlreadyExistsException') {
            return ok(getCollectionId(job.event_id));
          }
          // Other rekognition errors propagate
          return err<string, PhotoProcessingError>({ type: 'rekognition', cause: rekErr });
        });

      // Update event with collection ID (idempotent)
      yield* ResultAsync.fromPromise(
        db
          .update(events)
          .set({ rekognitionCollectionId: getCollectionId(job.event_id) })
          .where(eq(events.id, job.event_id)),
        (cause): PhotoProcessingError => ({ type: 'database', operation: 'update_event_collection', cause }),
      );
    }

    // TRANSACTION: Insert faces, update photo status
    yield* ResultAsync.fromPromise(
      dbTx.transaction(async (tx) => {
        // STEP 1: Insert face records (if any)
        if (data.faceRecords.length > 0) {
          const faceRows = data.faceRecords.map((faceRecord) => ({
            photoId: job.photo_id,
            rekognitionFaceId: faceRecord.Face?.FaceId ?? null,
            rekognitionResponse: faceRecord,
            boundingBox: faceRecord.Face?.BoundingBox ?? null,
          }));

          await tx.insert(faces).values(faceRows);
        }

        // STEP 2: Update photo status to 'indexed'
        await tx
          .update(photos)
          .set({
            status: 'indexed',
            faceCount: data.faceRecords.length,
            retryable: null, // Clear retryable flag
            errorName: null, // Clear error name
            indexedAt: new Date().toISOString(), // Record indexing completion timestamp
          })
          .where(eq(photos.id, job.photo_id));

        // Note: event counts (photo_count, face_count) are not stored in the events table schema
        // If needed in the future, add columns to events table and update them here
      }),
      (cause): PhotoProcessingError => ({ type: 'database', operation: 'transaction_persist', cause }),
    );

    // POST-STEP: Log unindexed faces (informational)
    if (data.unindexedFaces.length > 0) {
      console.warn(
        `[Queue] ${data.unindexedFaces.length} faces not indexed`,
        {
          photoId: job.photo_id,
          reasons: data.unindexedFaces.map((f) => f.Reasons).flat(),
        },
      );
    }

    return ok(undefined);
  });
}

// =============================================================================
// Photo Processing
// =============================================================================

/**
 * Fetch image from R2.
 */
function fetchImageFromR2(
  env: Bindings,
  r2Key: string,
): ResultAsync<R2ObjectBody, PhotoProcessingError> {
  return ResultAsync.fromPromise(
    env.PHOTOS_BUCKET.get(r2Key),
    (): PhotoProcessingError => ({ type: 'not_found', resource: 'r2_image', key: r2Key }),
  ).andThen((object) =>
    object
      ? ok(object)
      : err<R2ObjectBody, PhotoProcessingError>({ type: 'not_found', resource: 'r2_image', key: r2Key }),
  );
}

/**
 * Ensure collection exists, create if needed.
 */
function ensureCollection(
  client: RekognitionClient,
  db: Database,
  eventId: string,
): ResultAsync<void, PhotoProcessingError> {
  return safeTry(async function* () {
    // Check if collection exists
    const existing = yield* ResultAsync.fromPromise(
      db.query.events.findFirst({
        where: and(eq(events.id, eventId), isNotNull(events.rekognitionCollectionId)),
        columns: { rekognitionCollectionId: true },
      }),
      (e): PhotoProcessingError => ({ type: 'database', operation: 'check_collection', cause: e }),
    );

    if (existing) {
      return ok(undefined);
    }

    // Create collection
    yield* createCollectionSafe(client, eventId)
      .mapErr((e): PhotoProcessingError => ({ type: 'rekognition', cause: e }));

    // Update event table
    yield* ResultAsync.fromPromise(
      db.update(events)
        .set({ rekognitionCollectionId: getCollectionId(eventId) })
        .where(eq(events.id, eventId)),
      (e): PhotoProcessingError => ({ type: 'database', operation: 'update_event_collection', cause: e }),
    );

    return ok(undefined);
  });
}

/**
 * Process a single photo using safeTry for flat async flow.
 * Returns ResultAsync<IndexFacesResult, PhotoProcessingError>.
 */
function processPhoto(
  env: Bindings,
  client: RekognitionClient,
  db: Database,
  message: Message<PhotoJob>,
): ResultAsync<IndexFacesResult, PhotoProcessingError> {
  const job = message.body;

  return safeTry(async function* () {
    // Step 1: Fetch image from R2
    const object = yield* fetchImageFromR2(env, job.r2_key);

    // Step 2: Get image bytes
    const originalBytes = await object.arrayBuffer();

    // Step 3: Transform if needed (best effort, fallback to original on failure)
    const MAX_REKOGNITION_SIZE = 5 * 1024 * 1024; // 5 MB
    let imageBytes = originalBytes;
    if (originalBytes.byteLength > MAX_REKOGNITION_SIZE) {
      // Best-effort transform: use orElse to fallback to original bytes on failure
      imageBytes = yield* transformImageForRekognition(env, originalBytes)
        .orElse((transformErr) => {
          console.error(`[Queue] Transform failed, using original`, {
            photoId: job.photo_id,
            error: transformErr.type === 'transform' ? transformErr.message : transformErr.type,
          });
          return ok(originalBytes);
        });
    }

    // Step 4: Ensure collection exists
    yield* ensureCollection(client, db, job.event_id);

    // Step 5: Index faces
    const indexResult = yield* indexFacesSafe(client, job.event_id, imageBytes, job.photo_id)
      .mapErr((e): PhotoProcessingError => ({ type: 'rekognition', cause: e }));

    return ok(indexResult);
  }).mapErr((error) => {
    // Log with type-specific info
    const logData: Record<string, unknown> = {
      photoId: job.photo_id,
      eventId: job.event_id,
      errorType: error.type,
    };

    if (error.type === 'rekognition') {
      logData.awsErrorName = error.cause.name;
      logData.retryable = error.cause.retryable;
      logData.throttle = error.cause.throttle;
    }

    console.error(`[Queue] Photo processing failed`, logData);
    return error;
  });
}

// =============================================================================
// Queue Handler
// =============================================================================

/**
 * Queue consumer handler for photo processing.
 *
 * Strategy:
 * - Fire Rekognition requests at 20ms intervals (50 TPS pacing)
 * - Don't await each response - let them complete in parallel
 * - Collect all results, then handle ack/retry at the end using .match()
 */
export async function queue(
  batch: MessageBatch<PhotoJob>,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  if (batch.messages.length === 0) {
    return;
  }

  console.log(`[Queue] Batch start`, { batchSize: batch.messages.length });

  // Get rate limiter DO (singleton) - uses RPC
  const rateLimiterId = env.AWS_REKOGNITION_RATE_LIMITER.idFromName('global');
  const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(rateLimiterId);

  // Reserve time slot for this batch
  const { delay, intervalMs } = await rateLimiter.reserveBatch(batch.messages.length);

  if (delay > 0) {
    await sleep(delay);
  }

  // Create database connections once for entire batch
  const db = createDb(env.DATABASE_URL);
  const dbTx = createDbTx(env.DATABASE_URL);  // WebSocket for transactions

  // Create Rekognition client once for entire batch
  const client = createRekognitionClient({
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: env.AWS_REGION,
  });

  // Fire all requests with paced initiation (20ms intervals)
  // Collect ProcessedPhoto with message + result
  const processed: ProcessedPhoto[] = await Promise.all(
    batch.messages.map(async (message, index) => {
      // Pace request initiation to stay within TPS limit
      if (index > 0) {
        await sleep(index * intervalMs);
      }

      const result = await processPhoto(env, client, db, message);
      return { message, result };
    }),
  );

  // Handle ack/retry - iterate through results
  let hasThrottleError = false;
  let successCount = 0;
  let failCount = 0;

  for (const { message, result } of processed) {
    const job = message.body;

    await result
      .orTee((error) => {
        // Centralized error logging
        const logData: Record<string, unknown> = { photoId: job.photo_id, errorType: error.type };

        switch (error.type) {
          case 'rekognition':
            logData.awsErrorName = error.cause.name;
            logData.retryable = error.cause.retryable;
            logData.throttle = error.cause.throttle;
            break;
          case 'not_found':
            logData.key = error.key;
            break;
          case 'database':
            logData.operation = error.operation;
            break;
          case 'transform':
            logData.errorMessage = error.message;
            break;
        }

        console.error(`[Queue] Photo processing failed`, logData);
      })
      .match(
        // Success path - persist faces and update photo
        async (indexResult) => {
          await persistFacesAndUpdatePhoto(dbTx, db, job, indexResult, client)
            .orTee((persistErr) => {
              console.error(`[Queue] Persist error`, {
                photoId: job.photo_id,
                type: persistErr.type,
                ...(persistErr.type === 'database' ? { operation: persistErr.operation } : {}),
                ...(persistErr.type === 'rekognition' ? { name: persistErr.cause.name } : {}),
              });
            })
            .match(
              () => {
                successCount++;
                message.ack();
              },
              async (persistErr) => {
                failCount++;
                // Best-effort: mark photo with retryable error
                const errorName = persistErr.type === 'rekognition' ? persistErr.cause.name : 'DatabaseError';
                await ResultAsync.fromPromise(
                  db.update(photos).set({ retryable: true, errorName }).where(eq(photos.id, job.photo_id)),
                  (e) => e,
                ).match(
                  () => {},
                  (e) => console.error(`[Queue] Failed to mark retryable error:`, e),
                );

                message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
              },
            );
        },
        // Error path - control flow only (logging done in orTee above)
        async (error) => {
          failCount++;
          switch (error.type) {
            case 'rekognition': {
              const awsErr = error.cause;

              // Throttle: retry with longer backoff, report to rate limiter
              if (awsErr.throttle) {
                hasThrottleError = true;

                await ResultAsync.fromPromise(
                  db.update(photos).set({ retryable: true, errorName: awsErr.name }).where(eq(photos.id, job.photo_id)),
                  (e) => e,
                ).match(
                  () => {},
                  (e) => console.error(`[Queue] Failed to mark throttle error:`, e),
                );

                message.retry({ delaySeconds: getThrottleBackoffDelay(message.attempts) });
                return;
              }

              // Non-retryable AWS error: mark as failed
              if (!awsErr.retryable) {
                await ResultAsync.fromPromise(
                  db.update(photos).set({ status: 'failed', retryable: false, errorName: awsErr.name }).where(eq(photos.id, job.photo_id)),
                  (e) => e,
                ).match(
                  () => {},
                  (e) => console.error(`[Queue] Failed to mark photo as failed:`, e),
                );

                message.ack();
                return;
              }

              // Retryable AWS error: retry with backoff
              await ResultAsync.fromPromise(
                db.update(photos).set({ retryable: true, errorName: awsErr.name }).where(eq(photos.id, job.photo_id)),
                (e) => e,
              ).match(
                () => {},
                (e) => console.error(`[Queue] Failed to mark retryable error:`, e),
              );

              message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
              break;
            }

            case 'not_found': {
              await ResultAsync.fromPromise(
                db.update(photos).set({ status: 'failed', retryable: false, errorName: 'NotFoundError' }).where(eq(photos.id, job.photo_id)),
                (e) => e,
              ).match(
                () => {},
                (e) => console.error(`[Queue] Failed to mark photo as failed:`, e),
              );

              message.ack();
              break;
            }

            case 'database': {
              await ResultAsync.fromPromise(
                db.update(photos).set({ retryable: true, errorName: 'DatabaseError' }).where(eq(photos.id, job.photo_id)),
                (e) => e,
              ).match(
                () => {},
                (e) => console.error(`[Queue] Failed to mark database error:`, e),
              );

              message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
              break;
            }

            case 'transform': {
              await ResultAsync.fromPromise(
                db.update(photos).set({ retryable: true, errorName: 'TransformError' }).where(eq(photos.id, job.photo_id)),
                (e) => e,
              ).match(
                () => {},
                (e) => console.error(`[Queue] Failed to mark transform error:`, e),
              );

              message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
              break;
            }
          }
        },
      );
  }

  // Report throttle to rate limiter if any request was throttled
  if (hasThrottleError) {
    await rateLimiter.reportThrottle(2000);
  }

  console.log(`[Queue] Batch complete`, { batchSize: batch.messages.length, successCount, failCount });
}
