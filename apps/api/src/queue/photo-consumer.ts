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
import {
  createRekognitionClient,
  indexFaces,
  type IndexFacesResult,
  isRetryableError,
  isNonRetryableError,
  isThrottlingError,
  getBackoffDelay,
  getThrottleBackoffDelay,
  formatErrorMessage,
} from "../lib/rekognition";
import { sleep } from "../utils/async";

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
  env: CloudflareBindings,
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

        const imageBytes = await object.arrayBuffer();

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

  // Handle ack/retry based on individual results
  let hasThrottleError = false;

  for (const { message, data, error } of results) {
    if (error) {
      const errorMessage = formatErrorMessage(error);
      const job = message.body;

      if (isThrottlingError(error)) {
        console.error(`[Queue] Throttled: ${job.photo_id} - ${errorMessage}`);
        hasThrottleError = true;
        message.retry({ delaySeconds: getThrottleBackoffDelay(message.attempts) });
      } else if (isNonRetryableError(error)) {
        console.error(`[Queue] Non-retryable: ${job.photo_id} - ${errorMessage}`);
        message.ack(); // Don't retry
      } else if (isRetryableError(error)) {
        console.error(`[Queue] Retryable: ${job.photo_id} - ${errorMessage}`);
        message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
      } else {
        console.error(`[Queue] Unknown error: ${job.photo_id} - ${errorMessage}`);
        message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
      }
    } else {
      // TODO: Application layer will handle DB writes here
      message.ack();
    }
  }

  // Report throttle to rate limiter if any request was throttled
  if (hasThrottleError) {
    await rateLimiter.reportThrottle(2000);
  }
}
