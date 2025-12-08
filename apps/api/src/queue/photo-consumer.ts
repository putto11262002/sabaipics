/**
 * Photo Processing Queue Consumer
 *
 * Handles photo-processing queue messages with:
 * - Rate limiting via Durable Object (RPC)
 * - Per-message ack/retry
 * - Error classification and backoff
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
 * Contains Rekognition results for application layer to handle.
 */
export interface PhotoProcessingResult {
  success: boolean;
  data?: IndexFacesResult;
  error?: string;
}

// =============================================================================
// Queue Handler
// =============================================================================

/**
 * Queue consumer handler for photo processing.
 * Uses RPC to communicate with rate limiter DO.
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

  // Process each message with pacing
  for (const message of batch.messages) {
    const job = message.body;

    try {
      // 1. Fetch image from R2
      const object = await env.PHOTOS_BUCKET.get(job.r2_key);

      if (!object) {
        console.error(`[Queue] Image not found: ${job.r2_key}`);
        message.ack(); // Don't retry - image doesn't exist
        continue;
      }

      const imageBytes = await object.arrayBuffer();

      // 2. Create Rekognition client
      const client = createRekognitionClient({
        AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
        AWS_REGION: env.AWS_REGION,
      });

      // 3. Call Rekognition IndexFaces
      const result = await indexFaces(
        client,
        job.event_id,
        imageBytes,
        job.photo_id
      );

      // TODO: Application layer will handle DB writes here
      // For now, just ack the message
      message.ack();
    } catch (error) {
      // Handle errors with appropriate retry strategy
      const errorMessage = formatErrorMessage(error);

      if (isThrottlingError(error)) {
        console.error(`[Queue] Throttled: ${job.photo_id} - ${errorMessage}`);
        await rateLimiter.reportThrottle(2000);
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
    }

    // Pace requests to stay within TPS limit
    await sleep(intervalMs);
  }
}
