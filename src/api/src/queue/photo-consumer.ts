/**
 * Photo Processing Queue Consumer (v2)
 *
 * Handles photo-processing queue messages:
 * - Sends R2 public URL to InsightFace /extract endpoint (Modal fetches directly)
 * - Stores face embeddings in pgvector via Drizzle
 * - Updates photo status
 *
 * No AWS collections, no R2 fetch in Worker, no TPS pacing.
 * The extraction service is self-hosted on Modal with no TPS limits.
 */

import * as Sentry from '@sentry/cloudflare';
import type { PhotoJob } from '../types/photo-job';
import type { Bindings } from '../types';
import {
  createExtractor,
  insertFaceEmbeddings,
  isRetryable,
  isThrottle,
  getErrorName,
  getBackoffDelay,
  getThrottleBackoffDelay,
  type RecognitionError,
  type ExtractionResult,
} from '../lib/recognition';
import { createDb, createDbTx } from '@/db';
import { photos } from '@/db';
import { eq } from 'drizzle-orm';
import { ResultAsync, type Result } from 'neverthrow';

// Must match wrangler.api.jsonc consumer max_retries setting.
// CF Workers: attempts starts at 1, so last attempt = MAX_RETRIES + 1.
const MAX_RETRIES = 1;

// =============================================================================
// Types
// =============================================================================

/**
 * Photo processing error — discriminated union for this layer.
 */
export type PhotoProcessingError =
  | { type: 'database'; operation: string; cause: unknown }
  | { type: 'recognition'; cause: RecognitionError };

/**
 * Result of processing a single photo.
 */
interface ProcessedPhoto {
  message: Message<PhotoJob>;
  result: Result<ExtractionResult, PhotoProcessingError>;
}

// =============================================================================
// Sentry Helpers
// =============================================================================

function capturePhotoError(
  errorType: string,
  context: {
    photoId: string;
    eventId: string;
    r2Key: string;
    extra?: Record<string, unknown>;
  },
): void {
  Sentry.withScope((scope) => {
    scope.setTag('error_type', errorType);
    scope.setTag('queue', 'photo-processing');
    scope.setTag('photo_id', context.photoId);
    scope.setTag('event_id', context.eventId);
    scope.setExtra('r2_key', context.r2Key);
    if (context.extra) {
      for (const [k, v] of Object.entries(context.extra)) {
        scope.setExtra(k, v);
      }
    }
    scope.setLevel('error');
    Sentry.captureMessage(`Photo processing failed: ${errorType}`);
  });
}

function capturePhotoWarning(
  errorType: string,
  context: {
    photoId: string;
    eventId: string;
    r2Key: string;
    extra?: Record<string, unknown>;
  },
): void {
  Sentry.withScope((scope) => {
    scope.setTag('error_type', errorType);
    scope.setTag('queue', 'photo-processing');
    scope.setTag('photo_id', context.photoId);
    scope.setTag('event_id', context.eventId);
    scope.setExtra('r2_key', context.r2Key);
    if (context.extra) {
      for (const [k, v] of Object.entries(context.extra)) {
        scope.setExtra(k, v);
      }
    }
    scope.setLevel('warning');
    Sentry.captureMessage(`Photo processing warning: ${errorType}`);
  });
}

// =============================================================================
// Database Persistence
// =============================================================================

/**
 * Persist face embeddings and update photo status to 'indexed'.
 *
 * Creates a fresh WebSocket transaction connection per-call to avoid
 * Cloudflare Workers cross-request I/O errors.
 */
function persistAndUpdatePhoto(
  databaseUrl: string,
  job: PhotoJob,
  data: ExtractionResult,
): ResultAsync<void, PhotoProcessingError> {
  const dbTx = createDbTx(databaseUrl);

  return ResultAsync.fromPromise(
    dbTx.transaction(async (tx) => {
      // Step 1: Insert face embeddings (if any)
      if (data.faces.length > 0) {
        await insertFaceEmbeddings(tx, job.photo_id, data.faces).match(
          () => {},
          (recErr) => {
            throw recErr.type === 'database'
              ? (recErr.cause ?? new Error(`Insert face embeddings failed`))
              : new Error(`Insert face embeddings failed: ${recErr.type}`);
          },
        );
      }

      // Step 2: Update photo status to 'indexed'
      await tx
        .update(photos)
        .set({
          status: 'indexed',
          faceCount: data.faces.length,
          retryable: null,
          errorName: null,
          indexedAt: new Date().toISOString(),
        })
        .where(eq(photos.id, job.photo_id));
    }),
    (cause): PhotoProcessingError => ({
      type: 'database',
      operation: 'transaction_persist',
      cause,
    }),
  );
}

// =============================================================================
// Photo Processing
// =============================================================================

/**
 * Process a single photo: send R2 public URL to extraction service.
 * Modal fetches the image directly from R2 — no need to load bytes into Worker memory.
 */
function processPhoto(
  env: Bindings,
  message: Message<PhotoJob>,
): ResultAsync<ExtractionResult, PhotoProcessingError> {
  const job = message.body;
  const extractor = createExtractor({ endpoint: env.RECOGNITION_ENDPOINT });
  const imageUrl = `${env.PHOTO_R2_BASE_URL}/${job.r2_key}`;

  return extractor
    .extractFacesFromUrl(imageUrl)
    .mapErr((e): PhotoProcessingError => ({ type: 'recognition', cause: e }))
    .mapErr((error) => {
      const logData: Record<string, unknown> = {
        photoId: job.photo_id,
        eventId: job.event_id,
        errorType: error.type,
      };

      if (error.type === 'recognition') {
        logData.recognitionErrorType = error.cause.type;
        logData.retryable = error.cause.retryable;
        logData.throttle = error.cause.throttle;
      }

      console.error(`[Queue] Photo processing failed`, logData);
      return error;
    });
}

// =============================================================================
// Error Helpers
// =============================================================================

function getProcessingErrorName(error: PhotoProcessingError): string {
  if (error.type === 'recognition') return getErrorName(error.cause);
  if (error.type === 'database') return 'DatabaseError';
  return 'UnknownError';
}

function isRetryableProcessingError(error: PhotoProcessingError): boolean {
  if (error.type === 'recognition') return isRetryable(error.cause);
  if (error.type === 'database') return true;
  return false;
}

function isThrottleProcessingError(error: PhotoProcessingError): boolean {
  if (error.type === 'recognition') return isThrottle(error.cause);
  return false;
}

// =============================================================================
// Queue Handler
// =============================================================================

/**
 * Queue consumer handler for photo processing.
 *
 * Strategy:
 * - Fire all extraction requests in parallel (no TPS pacing needed)
 * - Collect all results, then handle ack/retry
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

  const db = createDb(env.DATABASE_URL);

  // Process all photos in parallel (no rate limiter needed)
  const processed: ProcessedPhoto[] = await Promise.all(
    batch.messages.map(async (message) => {
      const result = await Sentry.startSpan(
        { name: 'photo.process', op: 'queue.process' },
        async (span) => {
          const job = message.body;
          span.setAttribute('photo.id', job.photo_id);
          span.setAttribute('photo.event_id', job.event_id);
          span.setAttribute('photo.r2_key', job.r2_key);

          const r = await processPhoto(env, message);
          r.match(
            (data) => {
              span.setAttribute('photo.status', 'ok');
              span.setAttribute('photo.face_count', data.faces.length);
            },
            (error) => {
              span.setAttribute('photo.status', 'error');
              span.setAttribute('photo.error_type', error.type);
            },
          );
          return r;
        },
      );
      return { message, result };
    }),
  );

  // Handle ack/retry
  let successCount = 0;
  let failCount = 0;

  for (const { message, result } of processed) {
    const job = message.body;
    const sentryCtx = { photoId: job.photo_id, eventId: job.event_id, r2Key: job.r2_key };

    await result
      .orTee((error) => {
        const extra: Record<string, unknown> = {};
        if (error.type === 'recognition') {
          extra.recognitionErrorType = error.cause.type;
          extra.retryable = error.cause.retryable;
          extra.throttle = error.cause.throttle;
        } else if (error.type === 'database') {
          extra.operation = error.operation;
        }

        const isLastAttempt = message.attempts > MAX_RETRIES;
        const retryable = isRetryableProcessingError(error);
        extra.attempt = message.attempts;
        extra.isLastAttempt = isLastAttempt;

        const captureFn = !retryable || isLastAttempt ? capturePhotoError : capturePhotoWarning;
        captureFn(error.type, { ...sentryCtx, extra });
      })
      .match(
        // Success path — persist embeddings and update photo
        async (extractResult) => {
          await persistAndUpdatePhoto(env.DATABASE_URL, job, extractResult)
            .orTee((persistErr) => {
              console.error(`[Queue] Persist error`, {
                photoId: job.photo_id,
                type: persistErr.type,
                ...(persistErr.type === 'database' ? { operation: persistErr.operation } : {}),
              });
              capturePhotoWarning('persist_failed', {
                ...sentryCtx,
                extra: { persistErrorType: persistErr.type },
              });
            })
            .match(
              () => {
                successCount++;
                message.ack();
              },
              async (persistErr) => {
                failCount++;
                const errorName = getProcessingErrorName(persistErr);
                const isLastAttempt = message.attempts > MAX_RETRIES;

                const writeResult = await ResultAsync.fromPromise(
                  db
                    .update(photos)
                    .set(
                      isLastAttempt
                        ? { status: 'failed' as const, retryable: false, errorName }
                        : { retryable: true, errorName },
                    )
                    .where(eq(photos.id, job.photo_id)),
                  (e) => e,
                );

                if (writeResult.isErr()) {
                  console.error(`[Queue] Failed to mark photo error:`, writeResult.error);
                  message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
                } else if (isLastAttempt) {
                  message.ack();
                } else {
                  message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
                }
              },
            );
        },
        // Error path
        async (error) => {
          failCount++;
          const throttle = isThrottleProcessingError(error);
          const retryable = isRetryableProcessingError(error);
          const errorName = getProcessingErrorName(error);
          const isLastAttempt = message.attempts > MAX_RETRIES;

          // Determine retry delay
          const delayFn = throttle ? getThrottleBackoffDelay : getBackoffDelay;

          // Write error to photo record
          const writeResult = await ResultAsync.fromPromise(
            db
              .update(photos)
              .set(
                !retryable || isLastAttempt
                  ? { status: 'failed' as const, retryable: false, errorName }
                  : { retryable: true, errorName },
              )
              .where(eq(photos.id, job.photo_id)),
            (e) => e,
          );

          if (writeResult.isErr()) {
            console.error(`[Queue] Failed to mark photo error:`, writeResult.error);
            message.retry({ delaySeconds: delayFn(message.attempts) });
          } else if (!retryable || isLastAttempt) {
            message.ack();
          } else {
            message.retry({ delaySeconds: delayFn(message.attempts) });
          }
        },
      );
  }

  console.log(`[Queue] Batch complete`, {
    batchSize: batch.messages.length,
    successCount,
    failCount,
  });
}
