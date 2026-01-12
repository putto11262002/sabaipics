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
  indexFaces,
  indexFacesSafe,
  createCollection,
  createCollectionSafe,
  getCollectionId,
  RekognitionError,
  type IndexFacesResult,
  isRetryableError as isAwsRetryableError,
  isNonRetryableError as isAwsNonRetryableError,
  getBackoffDelay,
  getThrottleBackoffDelay,
  formatErrorMessage,
} from '../lib/rekognition';
import { RekognitionClient } from '@aws-sdk/client-rekognition';
import { sleep } from '../utils/async';
import { createDb, type Database } from '@sabaipics/db';
import { photos, events, faces } from '@sabaipics/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import { ResultAsync, ok, err, type Result } from 'neverthrow';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of processing a single photo.
 * Associates the message with its Result.
 */
interface ProcessedPhoto {
  message: Message<PhotoJob>;
  result: Result<IndexFacesResult, RekognitionError>;
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
 * @returns Transformed image as ArrayBuffer (JPEG, quality 85, max 4096x4096)
 */
async function transformImageForRekognition(
  env: Bindings,
  imageBytes: ArrayBuffer,
): Promise<ArrayBuffer> {
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
}

// =============================================================================
// Database Persistence
// =============================================================================

/**
 * Persist faces to database and update photo status to 'indexed'.
 *
 * Steps:
 * 1. Update photo status to 'indexing'
 * 2. Ensure event has Rekognition collection (create if needed)
 * 3. Insert face records (if any)
 * 4. Update photo status to 'indexed' with face_count, clear retryable/error
 *
 * @param db - Database instance
 * @param job - Photo job from queue
 * @param data - IndexFaces result from Rekognition
 * @param client - Rekognition client for collection creation
 */
async function persistFacesAndUpdatePhoto(
  db: Database,
  job: PhotoJob,
  data: IndexFacesResult,
  client: RekognitionClient,
): Promise<void> {
  console.log(`[Queue] Persisting results`, {
    photoId: job.photo_id,
    eventId: job.event_id,
    faceCount: data.faceRecords.length,
  });

  // STEP 1: Mark as 'indexing' (in progress)
  await db.update(photos).set({ status: 'indexing' }).where(eq(photos.id, job.photo_id));

  // STEP 2: Ensure collection exists
  const event = await db
    .select({ collectionId: events.rekognitionCollectionId })
    .from(events)
    .where(eq(events.id, job.event_id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!event.collectionId) {
    console.log(`[Queue] No collection in DB, creating`, {
      photoId: job.photo_id,
      eventId: job.event_id,
    });

    try {
      // Create collection
      await createCollection(client, job.event_id);

      // Update event (idempotent)
      await db
        .update(events)
        .set({ rekognitionCollectionId: getCollectionId(job.event_id) })
        .where(eq(events.id, job.event_id));

      console.log(`[Queue] Created collection for event`, {
        photoId: job.photo_id,
        eventId: job.event_id,
        collectionId: getCollectionId(job.event_id),
      });
    } catch (createError: unknown) {
      // Handle AlreadyExistsException (race condition)
      const err = createError as { name?: string };
      if (err.name === 'ResourceAlreadyExistsException') {
        console.warn(`[Queue] Collection already exists (race condition), continuing`, {
          photoId: job.photo_id,
          eventId: job.event_id,
        });
        // Update event record anyway (may be missing from DB)
        await db
          .update(events)
          .set({ rekognitionCollectionId: getCollectionId(job.event_id) })
          .where(eq(events.id, job.event_id));
      } else {
        throw createError; // Other errors should retry
      }
    }
  }

  // STEP 3: Insert faces (if any) - NO TRANSACTION
  if (data.faceRecords.length > 0) {
    console.log(`[Queue] Inserting face records`, {
      photoId: job.photo_id,
      faceCount: data.faceRecords.length,
    });

    const faceRows = data.faceRecords.map((faceRecord) => ({
      photoId: job.photo_id,
      rekognitionFaceId: faceRecord.Face?.FaceId ?? null,
      rekognitionResponse: faceRecord,
      boundingBox: faceRecord.Face?.BoundingBox ?? null,
    }));

    await db.insert(faces).values(faceRows);
  }

  // STEP 4: Update photo to 'indexed' (success)
  await db
    .update(photos)
    .set({
      status: 'indexed',
      faceCount: data.faceRecords.length,
      retryable: null, // Clear retryable flag
      errorName: null, // Clear error name
      indexedAt: new Date().toISOString(), // Record indexing completion timestamp
    })
    .where(eq(photos.id, job.photo_id));

  console.log(`[Queue] Photo marked as indexed`, {
    photoId: job.photo_id,
    faceCount: data.faceRecords.length,
  });

  // STEP 5: Log unindexed faces (informational)
  if (data.unindexedFaces.length > 0) {
    console.warn(
      `[Queue] ${data.unindexedFaces.length} faces not indexed`,
      {
        photoId: job.photo_id,
        reasons: data.unindexedFaces.map((f) => f.Reasons).flat(),
      },
    );
  }
}

// =============================================================================
// Photo Processing
// =============================================================================

/**
 * Process a single photo.
 * Returns ResultAsync<IndexFacesResult, RekognitionError>.
 */
function processPhoto(
  env: Bindings,
  client: RekognitionClient,
  db: Database,
  message: Message<PhotoJob>,
): ResultAsync<IndexFacesResult, RekognitionError> {
  const job = message.body;

  console.log(`[Queue] Processing photo`, {
    photoId: job.photo_id,
    eventId: job.event_id,
    r2Key: job.r2_key,
    attempt: message.attempts,
  });

  // Step 1: Fetch image from R2
  const fetchResult = ResultAsync.fromPromise(
    env.PHOTOS_BUCKET.get(job.r2_key),
    (): RekognitionError =>
      new RekognitionError(`Image not found: ${job.r2_key}`, {
        retryable: false,
        name: 'NotFoundError',
      }),
  );

  // Step 2-5: Process with flat async/await inside ResultAsync.fromPromise
  return fetchResult.andThen((object) => {
    // Handle null object (not found in R2)
    if (!object) {
      console.log(`[Queue] Image not found in R2`, {
        photoId: job.photo_id,
        r2Key: job.r2_key,
      });
      return err(
        new RekognitionError(`Image not found: ${job.r2_key}`, {
          retryable: false,
          name: 'NotFoundError',
        }),
      );
    }

    console.log(`[Queue] Image fetched from R2`, {
      photoId: job.photo_id,
      r2Key: job.r2_key,
    });

    // Wrap all async processing in ResultAsync.fromPromise
    return ResultAsync.fromPromise(
      (async () => {
        // Get bytes
        let imageBytes = await object.arrayBuffer();
        const sizeMb = (imageBytes.byteLength / 1024 / 1024).toFixed(2);
        console.log(`[Queue] Image bytes loaded`, {
          photoId: job.photo_id,
          size: `${sizeMb} MB`,
        });

        // Step 3: Transform if needed
        const MAX_REKOGNITION_SIZE = 5 * 1024 * 1024; // 5 MB

        if (imageBytes.byteLength > MAX_REKOGNITION_SIZE) {
          console.log(`[Queue] Image too large (${sizeMb} MB), transforming...`, {
            photoId: job.photo_id,
          });

          try {
            imageBytes = await transformImageForRekognition(env, imageBytes);
            console.log(`[Queue] Image transformed`, {
              photoId: job.photo_id,
              newSize: (imageBytes.byteLength / 1024 / 1024).toFixed(2),
            });
          } catch {
            console.error(`[Queue] Transform failed, using original`);
          }
        }

        // Step 4: Check/create collection
        console.log(`[Queue] Checking collection existence`, {
          photoId: job.photo_id,
          eventId: job.event_id,
        });

        const collectionCheck = await db.query.events.findFirst({
          where: and(eq(events.id, job.event_id), isNotNull(events.rekognitionCollectionId)),
          columns: { rekognitionCollectionId: true },
        });

        if (!collectionCheck) {
          console.log(`[Queue] Creating new collection`, {
            photoId: job.photo_id,
            eventId: job.event_id,
          });

          const createResult = await createCollectionSafe(client, job.event_id);
          if (createResult.isErr()) {
            throw createResult.error; // Will be caught by outer fromPromise
          }

          console.log(`[Queue] Collection created`, {
            photoId: job.photo_id,
            eventId: job.event_id,
            collectionArn: createResult.value,
          });

          // Update event table with collection ID
          const updateResult = await ResultAsync.fromPromise(
            db
              .update(events)
              .set({ rekognitionCollectionId: getCollectionId(job.event_id) })
              .where(eq(events.id, job.event_id)),
            (e): RekognitionError =>
              new RekognitionError('Failed to update event with collection ID', {
                retryable: true,
                name: 'DatabaseError',
                cause: e,
              }),
          );
          if (updateResult.isErr()) {
            throw updateResult.error; // Will be caught by outer fromPromise
          }

          console.log(`[Queue] Event updated with collection ID`, {
            photoId: job.photo_id,
            eventId: job.event_id,
          });
        } else {
          console.log(`[Queue] Collection exists`, {
            photoId: job.photo_id,
            eventId: job.event_id,
            collectionId: collectionCheck.rekognitionCollectionId,
          });
        }

        // Step 5: Index faces
        console.log(`[Queue] Starting face indexing`, {
          photoId: job.photo_id,
          eventId: job.event_id,
          imageSize: imageBytes.byteLength,
        });

        const indexResult = await indexFacesSafe(client, job.event_id, imageBytes, job.photo_id);
        if (indexResult.isErr()) {
          throw indexResult.error; // Will be caught by outer fromPromise
        }

        return indexResult.value;
      })(),
      (error): RekognitionError => {
        // If it's already a RekognitionError, return it as-is
        if (error instanceof RekognitionError) {
          return error;
        }
        // Otherwise wrap it
        return new RekognitionError(
          error instanceof Error ? error.message : String(error),
          {
            retryable: true,
            name: 'ProcessingError',
            cause: error,
          },
        );
      },
    );
  })
  .map((result) => {
    console.log(`[Queue] Face indexing complete`, {
      photoId: job.photo_id,
      eventId: job.event_id,
      facesFound: result.faceRecords.length,
      unindexedFaces: result.unindexedFaces.length,
    });
    return result;
  })
  .mapErr((error) => {
    console.error(`[Queue] Photo processing failed`, {
      photoId: job.photo_id,
      eventId: job.event_id,
      errorName: error.name,
      errorMessage: error.message,
      retryable: error.retryable,
      isThrottle: error.isThrottle,
    });
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

  console.log(`[Queue] Starting batch processing`, {
    batchSize: batch.messages.length,
    messages: batch.messages.map((m) => ({ photoId: m.body.photo_id, eventId: m.body.event_id })),
  });

  // Get rate limiter DO (singleton) - uses RPC
  const rateLimiterId = env.AWS_REKOGNITION_RATE_LIMITER.idFromName('global');
  const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(rateLimiterId);

  // Reserve time slot for this batch
  const { delay, intervalMs } = await rateLimiter.reserveBatch(batch.messages.length);

  console.log(`[Queue] Rate limiter reserved`, {
    batchSize: batch.messages.length,
    delay,
    intervalMs,
  });

  if (delay > 0) {
    console.log(`[Queue] Waiting for rate limiter delay`, { delayMs: delay });
    await sleep(delay);
  }

  // Create database connection once for entire batch
  const db = createDb(env.DATABASE_URL);

  // Create Rekognition client once for entire batch
  const client = createRekognitionClient({
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: env.AWS_REGION,
  });

  // Fire all requests with paced initiation (20ms intervals)
  // Collect ProcessedPhoto with message + result
  console.log(`[Queue] Firing parallel requests`, {
    count: batch.messages.length,
    pacingIntervalMs: intervalMs,
  });

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

  console.log(`[Queue] All requests complete, processing results`, {
    total: processed.length,
  });

  // Handle ack/retry - iterate through results
  let hasThrottleError = false;

  for (const { message, result } of processed) {
    const job = message.body;

    if (result.isOk()) {
      // Success path - await the persist operation
      try {
        await persistFacesAndUpdatePhoto(db, job, result.value, client);
        message.ack();
      } catch (dbError) {
        // Database errors are retryable
        console.error(`[Queue] Database error for ${job.photo_id}:`, dbError);

        try {
          await db
            .update(photos)
            .set({
              retryable: true,
              errorName: 'DatabaseError',
            })
            .where(eq(photos.id, job.photo_id));
        } catch (updateError) {
          console.error(`[Queue] Failed to mark photo with retryable error:`, updateError);
        }

        message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
      }
    } else {
      // Error path
      const error = result.error;
      const errorMessage = error.message;

      console.error(`[Queue] Processing failed`, {
        photoId: job.photo_id,
        errorName: error.name,
        errorMessage,
        retryable: error.retryable,
        isThrottle: error.isThrottle,
      });

      // Check if throttling error using isThrottle flag
      if (error.isThrottle) {
        hasThrottleError = true;

        try {
          await db
            .update(photos)
            .set({
              retryable: true,
              errorName: error.name,
            })
            .where(eq(photos.id, job.photo_id));
        } catch (dbError) {
          console.error(`[Queue] Failed to mark throttle error:`, dbError);
        }

        message.retry({ delaySeconds: getThrottleBackoffDelay(message.attempts) });
        return;
      }

      // Non-retryable: ack and mark failed
      if (!error.retryable) {
        try {
          await db
            .update(photos)
            .set({
              status: 'failed',
              retryable: false,
              errorName: error.name,
            })
            .where(eq(photos.id, job.photo_id));
        } catch (dbError) {
          console.error(`[Queue] Failed to mark photo as failed:`, dbError);
        }

        message.ack();
        return;
      }

      // Retryable: retry with backoff
      try {
        await db
          .update(photos)
          .set({
            retryable: true,
            errorName: error.name,
          })
          .where(eq(photos.id, job.photo_id));
      } catch (dbError) {
        console.error(`[Queue] Failed to mark retryable error:`, dbError);
      }

      message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
    }
  }

  // Report throttle to rate limiter if any request was throttled
  if (hasThrottleError) {
    await rateLimiter.reportThrottle(2000);
  }
}
