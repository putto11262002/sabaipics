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
 * - Calls face recognition provider (AWS or SabaiFace)
 * - Returns normalized domain types
 *
 * Application layer (NOT here) handles:
 * - Saving faces to DB
 * - Updating photo status
 * - WebSocket notifications
 */

import * as Sentry from '@sentry/cloudflare';
import type { PhotoJob } from '../types/photo-job';
import type { Bindings } from '../types';
import {
  createFaceProvider,
  getCollectionId,
  isResourceAlreadyExistsError,
  getBackoffDelay,
  getThrottleBackoffDelay,
  type FaceRecognitionProvider,
  type FaceServiceError,
  type PhotoIndexed,
  type Face,
  type AWSRawFaceRecord,
} from '../lib/rekognition';
import { sleep } from '../utils/async';
import { createDb, createDbTx, type Database, type DatabaseTx } from '@/db';
import { photos, events, faces } from '@/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import { ResultAsync, ok, err, safeTry, type Result } from 'neverthrow';

// Must match wrangler.api.jsonc consumer max_retries setting.
// CF Workers: attempts starts at 1, so last attempt = MAX_RETRIES + 1.
const MAX_RETRIES = 1;

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
  | { type: 'face_service'; cause: FaceServiceError }
  | { type: 'transform'; message: string; cause: unknown };

/**
 * Result of processing a single photo.
 * Associates the message with its Result.
 */
interface ProcessedPhoto {
  message: Message<PhotoJob>;
  result: Result<PhotoIndexed, PhotoProcessingError>;
}

// =============================================================================
// Sentry Helpers
// =============================================================================

/** Capture a photo processing error to Sentry */
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

/** Capture a retryable photo processing error to Sentry (warning level) */
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
 * Convert normalized Face to DB format (AWS-style for backwards compatibility).
 * The DB stores bounding boxes with capital letter keys (Width, Height, etc.)
 * and raw responses for model training.
 */
function faceToDbRecord(face: Face, photoId: string) {
  // Convert normalized bounding box back to AWS format for DB
  const awsBoundingBox = {
    Width: face.boundingBox.width,
    Height: face.boundingBox.height,
    Left: face.boundingBox.left,
    Top: face.boundingBox.top,
  };

  return {
    photoId,
    rekognitionFaceId: face.faceId || null,
    boundingBox: awsBoundingBox,
    rekognitionResponse: face.rawResponse as AWSRawFaceRecord | null,
  };
}

/**
 * Persist faces to database and update photo status to 'indexed'.
 *
 * Uses transaction to ensure atomicity:
 * - Insert face records
 * - Update photo status and face_count
 * - Update event counts (photo_count, face_count)
 *
 * Note: Creates its own WebSocket transaction connection per-call to avoid
 * Cloudflare Workers cross-request I/O errors. Each message needs its own
 * connection context.
 *
 * @param db - Non-transactional database instance (for pre-transaction checks)
 * @param databaseUrl - Database URL for creating transaction connection
 * @param job - Photo job from queue
 * @param data - PhotoIndexed result from provider
 * @param provider - Face recognition provider for collection creation
 * @returns ResultAsync<void, PhotoProcessingError>
 */
function persistFacesAndUpdatePhoto(
  db: Database,
  databaseUrl: string,
  job: PhotoJob,
  data: PhotoIndexed,
  provider: FaceRecognitionProvider,
): ResultAsync<void, PhotoProcessingError> {
  // Create fresh WebSocket connection for this transaction
  // Avoids cross-request I/O errors in Cloudflare Workers
  const dbTx = createDbTx(databaseUrl);
  return safeTry(async function* () {
    // PRE-STEP: Ensure collection exists (outside transaction - uses provider API)
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
      // Create collection, handle ResourceAlreadyExistsException (race condition)
      yield* provider.createCollection(job.event_id).orElse((faceErr) => {
        // Handle AlreadyExistsException (race condition) - treat as success
        if (faceErr.type === 'provider_failed' && faceErr.provider === 'aws') {
          const awsErr = faceErr as Extract<FaceServiceError, { provider: 'aws' }>;
          if (isResourceAlreadyExistsError(awsErr.errorName)) {
            return ok(getCollectionId(job.event_id));
          }
        }
        // Other errors propagate
        return err<string, PhotoProcessingError>({ type: 'face_service', cause: faceErr });
      });

      // Update event with collection ID (idempotent)
      yield* ResultAsync.fromPromise(
        db
          .update(events)
          .set({ rekognitionCollectionId: getCollectionId(job.event_id) })
          .where(eq(events.id, job.event_id)),
        (cause): PhotoProcessingError => ({
          type: 'database',
          operation: 'update_event_collection',
          cause,
        }),
      );
    }

    // TRANSACTION: Insert faces, update photo status
    yield* ResultAsync.fromPromise(
      dbTx.transaction(async (tx) => {
        // STEP 1: Insert face records (if any)
        if (data.faces.length > 0) {
          const faceRows = data.faces.map((face) => faceToDbRecord(face, job.photo_id));
          await tx.insert(faces).values(faceRows);
        }

        // STEP 2: Update photo status to 'indexed'
        await tx
          .update(photos)
          .set({
            status: 'indexed',
            faceCount: data.faces.length,
            retryable: null, // Clear retryable flag
            errorName: null, // Clear error name
            indexedAt: new Date().toISOString(), // Record indexing completion timestamp
          })
          .where(eq(photos.id, job.photo_id));

        // Note: event counts (photo_count, face_count) are not stored in the events table schema
        // If needed in the future, add columns to events table and update them here
      }),
      (cause): PhotoProcessingError => ({
        type: 'database',
        operation: 'transaction_persist',
        cause,
      }),
    );

    // POST-STEP: Log unindexed faces (informational)
    if (data.unindexedFaces.length > 0) {
      console.warn(`[Queue] ${data.unindexedFaces.length} faces not indexed`, {
        photoId: job.photo_id,
        reasons: data.unindexedFaces.map((f) => f.reasons).flat(),
      });
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
      : err<R2ObjectBody, PhotoProcessingError>({
          type: 'not_found',
          resource: 'r2_image',
          key: r2Key,
        }),
  );
}

/**
 * Ensure collection exists, create if needed.
 */
function ensureCollection(
  provider: FaceRecognitionProvider,
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

    // Create collection, handle ResourceAlreadyExistsException (race condition)
    yield* provider.createCollection(eventId).orElse((faceErr) => {
      // Handle AlreadyExistsException (race condition) - treat as success
      if (faceErr.type === 'provider_failed' && faceErr.provider === 'aws') {
        const awsErr = faceErr as Extract<FaceServiceError, { provider: 'aws' }>;
        if (isResourceAlreadyExistsError(awsErr.errorName)) {
          return ok(getCollectionId(eventId));
        }
      }
      // Other errors propagate
      return err<string, PhotoProcessingError>({ type: 'face_service', cause: faceErr });
    });

    // Update event table
    yield* ResultAsync.fromPromise(
      db
        .update(events)
        .set({ rekognitionCollectionId: getCollectionId(eventId) })
        .where(eq(events.id, eventId)),
      (e): PhotoProcessingError => ({
        type: 'database',
        operation: 'update_event_collection',
        cause: e,
      }),
    );

    return ok(undefined);
  });
}

/**
 * Process a single photo using safeTry for flat async flow.
 * Returns ResultAsync<PhotoIndexed, PhotoProcessingError>.
 */
function processPhoto(
  env: Bindings,
  provider: FaceRecognitionProvider,
  db: Database,
  message: Message<PhotoJob>,
): ResultAsync<PhotoIndexed, PhotoProcessingError> {
  const job = message.body;

  // Note: Sentry.startSpan cannot wrap yield* inside safeTry because ResultAsync
  // is thenable — startSpan awaits it, returning Result instead of ResultAsync,
  // which breaks the async iterator protocol. Per-message spans in the queue
  // handler (photo.process) provide the top-level tracing instead.
  return safeTry(async function* () {
    // Step 1: Fetch image from R2
    const object = yield* fetchImageFromR2(env, job.r2_key);

    // Step 2: Get image bytes (upload consumer guarantees ≤ 5 MB via adaptive quality)
    const imageBytes = await object.arrayBuffer();

    // Step 3: Ensure collection exists
    yield* ensureCollection(provider, db, job.event_id);

    // Step 4: Index faces using unified provider interface
    const indexResult = yield* provider
      .indexPhoto({
        eventId: job.event_id,
        photoId: job.photo_id,
        imageData: imageBytes,
      })
      .mapErr((e): PhotoProcessingError => ({ type: 'face_service', cause: e }));

    return ok(indexResult);
  }).mapErr((error) => {
    // Log with type-specific info
    const logData: Record<string, unknown> = {
      photoId: job.photo_id,
      eventId: job.event_id,
      errorType: error.type,
    };

    if (error.type === 'face_service') {
      const faceErr = error.cause;
      logData.faceErrorType = faceErr.type;
      if (faceErr.type === 'provider_failed') {
        logData.provider = faceErr.provider;
        logData.retryable = faceErr.retryable;
        logData.throttle = faceErr.throttle;
        logData.cause = faceErr.cause;
        if (faceErr.provider === 'aws') {
          logData.errorName = (faceErr as Extract<FaceServiceError, { provider: 'aws' }>).errorName;
        }
      }
    }

    console.error(`[Queue] Photo processing failed`, logData);
    return error;
  });
}

// =============================================================================
// Error Helpers
// =============================================================================

/**
 * Extract error name from FaceServiceError for DB storage
 */
function getErrorName(error: PhotoProcessingError): string {
  if (error.type === 'face_service') {
    const faceErr = error.cause;
    if (faceErr.type === 'provider_failed' && faceErr.provider === 'aws') {
      return (faceErr as Extract<FaceServiceError, { provider: 'aws' }>).errorName || 'AWSError';
    }
    if (faceErr.type === 'provider_failed' && faceErr.provider === 'sabaiface') {
      return 'SabaiFaceError';
    }
    return faceErr.type;
  }
  if (error.type === 'database') return 'DatabaseError';
  if (error.type === 'not_found') return 'NotFoundError';
  if (error.type === 'transform') return 'TransformError';
  return 'UnknownError';
}

/**
 * Check if error is retryable
 */
function isRetryableProcessingError(error: PhotoProcessingError): boolean {
  if (error.type === 'face_service') {
    return error.cause.retryable;
  }
  if (error.type === 'database') return true;
  if (error.type === 'transform') return true;
  if (error.type === 'not_found') return false;
  return false;
}

/**
 * Check if error is throttle
 */
function isThrottleProcessingError(error: PhotoProcessingError): boolean {
  if (error.type === 'face_service') {
    return error.cause.throttle;
  }
  return false;
}

// =============================================================================
// Queue Handler
// =============================================================================

/**
 * Queue consumer handler for photo processing.
 *
 * Strategy:
 * - Fire face recognition requests at 20ms intervals (50 TPS pacing)
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

  // Create HTTP database connection for batch (stateless, safe to share)
  const db = createDb(env.DATABASE_URL);
  // Note: dbTx (WebSocket) is created per-message in persistFacesAndUpdatePhoto
  // to avoid cross-request I/O errors in Cloudflare Workers

  // Create face recognition provider once for entire batch
  const provider = createFaceProvider(env);

  // Fire all requests with paced initiation (20ms intervals)
  // Collect ProcessedPhoto with message + result
  const processed: ProcessedPhoto[] = await Promise.all(
    batch.messages.map(async (message, index) => {
      // Pace request initiation to stay within TPS limit
      if (index > 0) {
        await sleep(index * intervalMs);
      }

      const result = await Sentry.startSpan(
        { name: 'photo.process', op: 'queue.process' },
        async (span) => {
          const job = message.body;
          span.setAttribute('photo.id', job.photo_id);
          span.setAttribute('photo.event_id', job.event_id);
          span.setAttribute('photo.r2_key', job.r2_key);

          const r = await processPhoto(env, provider, db, message);
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

  // Handle ack/retry - iterate through results
  let hasThrottleError = false;
  let successCount = 0;
  let failCount = 0;

  for (const { message, result } of processed) {
    const job = message.body;
    const sentryCtx = { photoId: job.photo_id, eventId: job.event_id, r2Key: job.r2_key };

    await result
      .orTee((error) => {
        // Centralized error logging
        const logData: Record<string, unknown> = { photoId: job.photo_id, errorType: error.type };
        const extra: Record<string, unknown> = {};

        switch (error.type) {
          case 'face_service': {
            const faceErr = error.cause;
            logData.faceErrorType = faceErr.type;
            extra.faceErrorType = faceErr.type;
            if (faceErr.type === 'provider_failed') {
              logData.provider = faceErr.provider;
              logData.retryable = faceErr.retryable;
              logData.throttle = faceErr.throttle;
              logData.cause = faceErr.cause;
              extra.provider = faceErr.provider;
              extra.retryable = faceErr.retryable;
              extra.throttle = faceErr.throttle;
            }
            break;
          }
          case 'not_found':
            logData.key = error.key;
            extra.key = error.key;
            break;
          case 'database':
            logData.operation = error.operation;
            extra.operation = error.operation;
            break;
          case 'transform':
            logData.errorMessage = error.message;
            extra.errorMessage = error.message;
            break;
        }

        console.error(`[Queue] Photo processing failed`, logData);

        // Escalate to error level on last attempt or non-retryable errors
        const isLastAttempt = message.attempts > MAX_RETRIES;
        const isRetryable = isRetryableProcessingError(error);
        extra.attempt = message.attempts;
        extra.isLastAttempt = isLastAttempt;

        const captureFn = !isRetryable || isLastAttempt
          ? capturePhotoError
          : capturePhotoWarning;
        captureFn(error.type, { ...sentryCtx, extra });
      })
      .match(
        // Success path - persist faces and update photo
        async (indexResult) => {
          await persistFacesAndUpdatePhoto(db, env.DATABASE_URL, job, indexResult, provider)
            .orTee((persistErr) => {
              console.error(`[Queue] Persist error`, {
                photoId: job.photo_id,
                type: persistErr.type,
                ...(persistErr.type === 'database'
                  ? { operation: persistErr.operation }
                  : {}),
                ...(persistErr.type === 'face_service'
                  ? { faceErrorType: persistErr.cause.type }
                  : {}),
              });
              capturePhotoWarning('persist_failed', {
                ...sentryCtx,
                extra: {
                  persistErrorType: persistErr.type,
                  ...(persistErr.type === 'database'
                    ? { operation: persistErr.operation }
                    : {}),
                },
              });
            })
            .match(
              () => {
                successCount++;
                message.ack();
              },
              async (persistErr) => {
                failCount++;
                const errorName = getErrorName(persistErr);
                const isLastAttempt = message.attempts > MAX_RETRIES;

                await ResultAsync.fromPromise(
                  db
                    .update(photos)
                    .set(isLastAttempt
                      ? { status: 'failed' as const, retryable: false, errorName }
                      : { retryable: true, errorName })
                    .where(eq(photos.id, job.photo_id)),
                  (e) => e,
                ).match(
                  () => {},
                  (e) => console.error(`[Queue] Failed to mark photo error:`, e),
                );

                if (isLastAttempt) {
                  message.ack();
                } else {
                  message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
                }
              },
            );
        },
        // Error path - control flow only (logging + Sentry done in orTee above)
        async (error) => {
          failCount++;
          const isThrottle = isThrottleProcessingError(error);
          const isRetryable = isRetryableProcessingError(error);
          const errorName = getErrorName(error);

          // Track throttle for rate limiter feedback
          if (isThrottle) {
            hasThrottleError = true;
          }

          // Throttle: retry with longer backoff, or fail on last attempt
          if (isThrottle) {
            const isLastAttempt = message.attempts > MAX_RETRIES;

            await ResultAsync.fromPromise(
              db
                .update(photos)
                .set(isLastAttempt
                  ? { status: 'failed' as const, retryable: false, errorName }
                  : { retryable: true, errorName })
                .where(eq(photos.id, job.photo_id)),
              (e) => e,
            ).match(
              () => {},
              (e) => console.error(`[Queue] Failed to mark throttle error:`, e),
            );

            if (isLastAttempt) {
              message.ack();
            } else {
              message.retry({ delaySeconds: getThrottleBackoffDelay(message.attempts) });
            }
            return;
          }

          // Non-retryable: mark as failed
          if (!isRetryable) {
            await ResultAsync.fromPromise(
              db
                .update(photos)
                .set({ status: 'failed', retryable: false, errorName })
                .where(eq(photos.id, job.photo_id)),
              (e) => e,
            ).match(
              () => {},
              (e) => console.error(`[Queue] Failed to mark photo as failed:`, e),
            );

            message.ack();
            return;
          }

          // Retryable: retry with backoff, or fail on last attempt
          const isLastAttempt = message.attempts > MAX_RETRIES;

          await ResultAsync.fromPromise(
            db
              .update(photos)
              .set(isLastAttempt
                ? { status: 'failed' as const, retryable: false, errorName }
                : { retryable: true, errorName })
              .where(eq(photos.id, job.photo_id)),
            (e) => e,
          ).match(
            () => {},
            (e) => console.error(`[Queue] Failed to mark retryable error:`, e),
          );

          if (isLastAttempt) {
            message.ack();
          } else {
            message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
          }
        },
      );
  }

  // Report throttle to rate limiter if any request was throttled
  if (hasThrottleError) {
    await rateLimiter.reportThrottle(2000);
  }

  console.log(`[Queue] Batch complete`, {
    batchSize: batch.messages.length,
    successCount,
    failCount,
  });
}
