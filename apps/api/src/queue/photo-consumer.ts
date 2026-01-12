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

import type { PhotoJob } from "../types/photo-job";
import type { Bindings } from "../types";
import {
  createRekognitionClient,
  indexFaces,
  createCollection,
  getCollectionId,
  type IndexFacesResult,
  isRetryableError,
  isNonRetryableError,
  isThrottlingError,
  getBackoffDelay,
  getThrottleBackoffDelay,
  formatErrorMessage,
} from "../lib/rekognition";
import { RekognitionClient } from "@aws-sdk/client-rekognition";
import { sleep } from "../utils/async";
import { createDb, type Database } from "@sabaipics/db";
import { photos, events, faces } from "@sabaipics/db";
import { eq } from "drizzle-orm";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of processing a single photo.
 * Uses [data, error] pattern so promises always resolve.
 */
interface ProcessingResult {
  message: Message<PhotoJob>;
  data: IndexFacesResult | null;
  error: unknown;
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
  imageBytes: ArrayBuffer
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
    .output({ format: "image/jpeg", quality: 85 });

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
  client: RekognitionClient
): Promise<void> {
  // STEP 1: Mark as 'indexing' (in progress)
  await db
    .update(photos)
    .set({ status: 'indexing' })
    .where(eq(photos.id, job.photo_id));

  // STEP 2: Ensure collection exists
  const event = await db
    .select({ collectionId: events.rekognitionCollectionId })
    .from(events)
    .where(eq(events.id, job.event_id))
    .limit(1)
    .then(rows => rows[0]);

  if (!event.collectionId) {
    try {
      // Create collection
      await createCollection(client, job.event_id);

      // Update event (idempotent)
      await db
        .update(events)
        .set({ rekognitionCollectionId: getCollectionId(job.event_id) })
        .where(eq(events.id, job.event_id));

      console.log(`[Queue] Created collection for event ${job.event_id}`);
    } catch (createError: any) {
      // Handle AlreadyExistsException (race condition)
      if (createError.name === 'ResourceAlreadyExistsException') {
        console.warn(`[Queue] Collection already exists for event ${job.event_id}, continuing`);
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
    const faceRows = data.faceRecords.map(faceRecord => ({
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
      retryable: null,        // Clear retryable flag
      errorMessage: null,     // Clear error message
    })
    .where(eq(photos.id, job.photo_id));

  // STEP 5: Log unindexed faces (informational)
  if (data.unindexedFaces.length > 0) {
    console.warn(
      `[Queue] ${data.unindexedFaces.length} faces not indexed in photo ${job.photo_id}`,
      { reasons: data.unindexedFaces.map(f => f.Reasons).flat() }
    );
  }
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
 * - Collect all results, then handle ack/retry at the end
 */
export async function queue(
  batch: MessageBatch<PhotoJob>,
  env: Bindings,
  ctx: ExecutionContext
): Promise<void> {
  if (batch.messages.length === 0) {
    return;
  }

  // Get rate limiter DO (singleton) - uses RPC
  const rateLimiterId = env.AWS_REKOGNITION_RATE_LIMITER.idFromName("global");
  const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(rateLimiterId);

  // Reserve time slot for this batch
  const { delay, intervalMs } = await rateLimiter.reserveBatch(
    batch.messages.length
  );

  if (delay > 0) {
    await sleep(delay);
  }

  // Create Rekognition client once for entire batch
  const client = createRekognitionClient({
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: env.AWS_REGION,
  });

  // Fire all requests with paced initiation (20ms intervals)
  // Don't await individual responses - let them complete in parallel
  const results = await Promise.all(
    batch.messages.map(async (message, index): Promise<ProcessingResult> => {
      // Pace request initiation to stay within TPS limit
      if (index > 0) {
        await sleep(index * intervalMs);
      }

      const job = message.body;

      try {
        // Fetch image from R2
        const object = await env.PHOTOS_BUCKET.get(job.r2_key);

        if (!object) {
          return {
            message,
            data: null,
            error: new Error(`Image not found: ${job.r2_key}`),
          };
        }

        let imageBytes = await object.arrayBuffer();

        // Check size and transform if needed for Rekognition
        const MAX_REKOGNITION_SIZE = 5 * 1024 * 1024; // 5 MB

        if (imageBytes.byteLength > MAX_REKOGNITION_SIZE) {
          console.log(
            `[Queue] Image too large (${(imageBytes.byteLength / 1024 / 1024).toFixed(2)} MB), transforming...`
          );

          try {
            // Transform image using CF Images API
            const transformedBytes = await transformImageForRekognition(env, imageBytes);
            imageBytes = transformedBytes;

            console.log(
              `[Queue] Transformed to ${(imageBytes.byteLength / 1024 / 1024).toFixed(2)} MB`
            );
          } catch (transformError) {
            console.error(`[Queue] Image transformation failed:`, transformError);
            // Continue with original image - let Rekognition reject if too large
          }
        }

        // Call Rekognition IndexFaces
        const result = await indexFaces(
          client,
          job.event_id,
          imageBytes,
          job.photo_id
        );

        return { message, data: result, error: null };
      } catch (error) {
        return { message, data: null, error };
      }
    })
  );

  // Create database connection once for entire batch
  const db = createDb(env.DATABASE_URL);

  // Handle ack/retry based on individual results
  let hasThrottleError = false;

  for (const { message, data, error } of results) {
    const job = message.body;

    if (error) {
      const errorMessage = formatErrorMessage(error);

      if (isThrottlingError(error)) {
        console.error(`[Queue] Throttled: ${job.photo_id} - ${errorMessage}`);
        hasThrottleError = true;

        // Mark as retryable error in DB
        try {
          await db
            .update(photos)
            .set({
              retryable: true,
              errorMessage: errorMessage.slice(0, 500),
            })
            .where(eq(photos.id, job.photo_id));
        } catch (dbError) {
          console.error(`[Queue] Failed to mark throttle error:`, dbError);
        }

        message.retry({ delaySeconds: getThrottleBackoffDelay(message.attempts) });
      } else if (isNonRetryableError(error)) {
        console.error(`[Queue] Non-retryable: ${job.photo_id} - ${errorMessage}`);

        // Mark photo as failed in DB
        try {
          await db
            .update(photos)
            .set({
              status: 'failed',
              retryable: false,
              errorMessage: errorMessage.slice(0, 500),
            })
            .where(eq(photos.id, job.photo_id));
        } catch (dbError) {
          console.error(`[Queue] Failed to mark photo as failed:`, dbError);
          // Still ack to prevent infinite retries
        }

        message.ack(); // Don't retry
      } else if (isRetryableError(error)) {
        console.error(`[Queue] Retryable: ${job.photo_id} - ${errorMessage}`);

        // Mark as retryable error in DB
        try {
          await db
            .update(photos)
            .set({
              retryable: true,
              errorMessage: errorMessage.slice(0, 500),
            })
            .where(eq(photos.id, job.photo_id));
        } catch (dbError) {
          console.error(`[Queue] Failed to mark retryable error:`, dbError);
          // Continue with retry anyway
        }

        message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
      } else {
        console.error(`[Queue] Unknown error: ${job.photo_id} - ${errorMessage}`);

        // Mark as retryable error (safe default)
        try {
          await db
            .update(photos)
            .set({
              retryable: true,
              errorMessage: errorMessage.slice(0, 500),
            })
            .where(eq(photos.id, job.photo_id));
        } catch (dbError) {
          console.error(`[Queue] Failed to mark unknown error:`, dbError);
        }

        message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
      }
    } else if (data) {
      // SUCCESS: IndexFaces completed
      try {
        await persistFacesAndUpdatePhoto(db, job, data, client);
        message.ack();
      } catch (dbError) {
        // Database errors are retryable
        console.error(`[Queue] Database error for ${job.photo_id}:`, dbError);

        // Mark as retryable error
        try {
          await db
            .update(photos)
            .set({
              retryable: true,
              errorMessage: String(dbError).slice(0, 500),
            })
            .where(eq(photos.id, job.photo_id));
        } catch (updateError) {
          console.error(`[Queue] Failed to mark photo with retryable error:`, updateError);
        }

        message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
      }
    } else {
      // Should not happen - data is null without error
      console.error(`[Queue] Unexpected: data is null for ${job.photo_id}`);
      message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
    }
  }

  // Report throttle to rate limiter if any request was throttled
  if (hasThrottleError) {
    await rateLimiter.reportThrottle(2000);
  }
}
