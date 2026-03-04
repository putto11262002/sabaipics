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
import { photos, uploadIntents } from '@/db';
import { eq } from 'drizzle-orm';
import { ResultAsync, type Result } from 'neverthrow';
import { emitWorkerLog } from '../lib/observability/worker-log';
import { emitCounterMetric, emitHistogramMetricMs } from '../lib/observability/metrics';
import { TraceSpan } from '../lib/observability/trace';
import { runWithTraceSpan } from '../lib/observability/trace-context';

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
  rootSpan: TraceSpan;
  startedAt: number;
  extractDurationMs: number;
}

const AREA = 'upload';
const COMPONENT = 'photo-consumer';
const E2E_HISTOGRAM_BOUNDS_MS = [
  100, 250, 500, 1000, 2500, 5000, 10000, 15000, 30000, 60000, 120000,
];
const RETRY_DELAY_BOUNDS_MS = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000];

function attemptBucket(attempt: number): '1' | '2' | '3_plus' {
  if (attempt <= 1) return '1';
  if (attempt === 2) return '2';
  return '3_plus';
}

function capturePhotoError(
  env: Bindings,
  ctx: ExecutionContext,
  errorType: string,
  context: {
    photoId: string;
    eventId: string;
    r2Key: string;
    extra?: Record<string, unknown>;
  },
): void {
  emitWorkerLog(
    env,
    'error',
    'photo_processing_failed',
    {
      area: AREA,
      component: COMPONENT,
      operation: 'process_photo',
      queue: 'photo-processing',
      error_type: errorType,
      photo_id: context.photoId,
      event_id: context.eventId,
      r2_key: context.r2Key,
      ...(context.extra ?? {}),
    },
    ctx,
  );
}

function capturePhotoWarning(
  env: Bindings,
  ctx: ExecutionContext,
  errorType: string,
  context: {
    photoId: string;
    eventId: string;
    r2Key: string;
    extra?: Record<string, unknown>;
  },
): void {
  emitWorkerLog(
    env,
    'warn',
    'photo_processing_warning',
    {
      area: AREA,
      component: COMPONENT,
      operation: 'process_photo',
      queue: 'photo-processing',
      error_type: errorType,
      photo_id: context.photoId,
      event_id: context.eventId,
      r2_key: context.r2Key,
      ...(context.extra ?? {}),
    },
    ctx,
  );
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
  const extractor = createExtractor({
    endpoint: env.RECOGNITION_ENDPOINT,
    modalKey: env.MODAL_KEY!,
    modalSecret: env.MODAL_SECRET!,
  });
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

  emitWorkerLog(
    env,
    'info',
    'photo_batch_start',
    {
      area: AREA,
      component: COMPONENT,
      operation: 'process_batch',
      queue: 'photo-processing',
      batch_size: batch.messages.length,
    },
    ctx,
  );

  const db = createDb(env.DATABASE_URL);

  // Process all photos in parallel (no rate limiter needed)
  const processed: ProcessedPhoto[] = await Promise.all(
    batch.messages.map(async (message) => {
      const startedAt = Date.now();
      const job = message.body;
      const rootSpan = new TraceSpan(env, 'photo.queue.process', {
        parentTraceparent: job.traceparent ?? null,
        baggage: job.baggage,
        ctx,
        attributes: {
          'queue.name': 'photo-processing',
          'job.photo_id': job.photo_id,
          'job.event_id': job.event_id,
          'worker.message_attempt': message.attempts,
        },
      });
      const extractSpan = rootSpan.child('recognition.extract', {
        attributes: {
          'http.route': '/extract',
        },
      });
      const extractStartedAt = Date.now();
      const result = await runWithTraceSpan(extractSpan, async () => await processPhoto(env, message));
      const extractDurationMs = Date.now() - extractStartedAt;
      result.match(
        (data) => {
          extractSpan.end('ok', {
            attributes: {
              'recognition.face_count': data.faces.length,
            },
          });
          emitWorkerLog(
            env,
            'info',
            'photo_processed',
            {
              area: AREA,
              component: COMPONENT,
              operation: 'process_photo',
              photo_id: job.photo_id,
              event_id: job.event_id,
              r2_key: job.r2_key,
              face_count: data.faces.length,
              trace_id: rootSpan.traceId,
              span_id: extractSpan.spanId,
            },
            ctx,
          );
        },
        (error) => {
          extractSpan.end('error', {
            attributes: {
              'error.type': error.type,
            },
            statusMessage: error.type,
          });
          emitWorkerLog(
            env,
            'warn',
            'photo_process_error',
            {
              area: AREA,
              component: COMPONENT,
              operation: 'process_photo',
              photo_id: job.photo_id,
              event_id: job.event_id,
              r2_key: job.r2_key,
              error_type: error.type,
              trace_id: rootSpan.traceId,
              span_id: extractSpan.spanId,
            },
            ctx,
          );
        },
      );
      return { message, result, rootSpan, startedAt, extractDurationMs };
    }),
  );

  // Handle ack/retry
  let successCount = 0;
  let failCount = 0;

  for (const { message, result, rootSpan, startedAt, extractDurationMs } of processed) {
    const emitJobMetrics = (status: 'ok' | 'error') => {
      emitCounterMetric(env, ctx, 'framefast_queue_jobs_total', 1, {
        queue: 'photo-processing',
        operation: 'process_photo',
        status,
        attempt_bucket: attemptBucket(message.attempts),
      });
      emitHistogramMetricMs(
        env,
        ctx,
        'framefast_queue_job_duration_ms',
        Date.now() - startedAt,
        {
          queue: 'photo-processing',
          operation: 'process_photo',
        },
      );
    };
    const emitRetryDecision = (options: {
      decision: 'retry' | 'ack';
      errorType: string;
      errorName: string;
      retryable: boolean;
      throttle: boolean;
      isLastAttempt: boolean;
      delaySeconds?: number;
      reason: string;
    }) => {
      emitCounterMetric(env, ctx, 'framefast_queue_retry_decisions_total', 1, {
        queue: 'photo-processing',
        operation: 'process_photo',
        decision: options.decision,
        error_type: options.errorType,
        error_name: options.errorName,
        retryable: options.retryable,
        throttle: options.throttle,
        is_last_attempt: options.isLastAttempt,
        attempt_bucket: attemptBucket(message.attempts),
      });
      if (typeof options.delaySeconds === 'number') {
        emitHistogramMetricMs(
          env,
          ctx,
          'framefast_queue_retry_delay_ms',
          options.delaySeconds * 1000,
          {
            queue: 'photo-processing',
            operation: 'process_photo',
            error_type: options.errorType,
            throttle: options.throttle,
          },
          RETRY_DELAY_BOUNDS_MS,
        );
      }
      emitWorkerLog(
        env,
        options.decision === 'retry' ? 'warn' : 'info',
        'photo_retry_decision',
        {
          area: AREA,
          component: COMPONENT,
          operation: 'process_photo',
          queue: 'photo-processing',
          photo_id: message.body.photo_id,
          event_id: message.body.event_id,
          r2_key: message.body.r2_key,
          decision: options.decision,
          reason: options.reason,
          error_type: options.errorType,
          error_name: options.errorName,
          retryable: options.retryable,
          throttle: options.throttle,
          is_last_attempt: options.isLastAttempt,
          attempt: message.attempts,
          delay_seconds: options.delaySeconds,
          trace_id: rootSpan.traceId,
          span_id: rootSpan.spanId,
        },
        ctx,
      );
    };
    const job = message.body;
    const logCtx = { photoId: job.photo_id, eventId: job.event_id, r2Key: job.r2_key };
    const uploadContext = await db.query.uploadIntents.findFirst({
      where: eq(uploadIntents.photoId, job.photo_id),
      columns: {
        createdAt: true,
        source: true,
      },
    });
    const uploadSource = uploadContext?.source ?? 'unknown';
    const emitUploadE2EMetrics = (status: 'ok' | 'error', errorType?: string) => {
      const nowMs = Date.now();
      const e2eDurationMs = uploadContext
        ? Math.max(0, nowMs - new Date(uploadContext.createdAt).getTime())
        : null;
      emitCounterMetric(env, ctx, 'framefast_upload_e2e_total', 1, {
        source: uploadSource,
        status,
        ...(errorType ? { error_type: errorType } : {}),
      });
      if (e2eDurationMs !== null) {
        emitHistogramMetricMs(env, ctx, 'framefast_upload_e2e_duration_ms', e2eDurationMs, {
          source: uploadSource,
          status,
        }, E2E_HISTOGRAM_BOUNDS_MS);
      }
    };
    emitHistogramMetricMs(env, ctx, 'framefast_upload_stage_duration_ms', extractDurationMs, {
      source: uploadSource,
      stage: 'face_extraction',
      status: result.isOk() ? 'ok' : 'error',
    });
    const emitWorkflowTerminalSpan = (
      status: 'ok' | 'error',
      options?: {
        attributes?: Record<string, string | number | boolean | null | undefined>;
        statusMessage?: string;
      },
    ) => {
      const workflowSpan = new TraceSpan(env, 'upload.workflow', {
        parentTraceparent: job.traceparent ?? null,
        baggage: job.baggage,
        ctx,
        attributes: {
          'workflow.name': 'upload_to_index',
          'workflow.status': status === 'ok' ? 'ok' : 'failed',
          'job.photo_id': job.photo_id,
          'job.event_id': job.event_id,
          'queue.name': 'photo-processing',
          'worker.message_attempt': message.attempts,
        },
      });
      workflowSpan.end(status, {
        attributes: options?.attributes,
        statusMessage: options?.statusMessage,
      });
    };

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
        captureFn(env, ctx, error.type, { ...logCtx, extra });
      })
      .match(
        // Success path — persist embeddings and update photo
        async (extractResult) => {
          await persistAndUpdatePhoto(env.DATABASE_URL, job, extractResult)
            .orTee((persistErr) => {
              emitWorkerLog(
                env,
                'warn',
                'photo_persist_error',
                {
                  area: AREA,
                  component: COMPONENT,
                  operation: 'persist_photo',
                  photo_id: job.photo_id,
                  error_type: persistErr.type,
                  ...(persistErr.type === 'database' ? { db_operation: persistErr.operation } : {}),
                },
                ctx,
              );
              capturePhotoWarning(env, ctx, 'persist_failed', {
                ...logCtx,
                extra: { persistErrorType: persistErr.type },
              });
            })
            .match(
              () => {
                successCount++;
                message.ack();
                rootSpan.end('ok');
                emitWorkflowTerminalSpan('ok');
                emitUploadE2EMetrics('ok');
                emitJobMetrics('ok');
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
                  const delaySeconds = getBackoffDelay(message.attempts);
                  emitRetryDecision({
                    decision: 'retry',
                    errorType: persistErr.type,
                    errorName: persistErr.type,
                    retryable: true,
                    throttle: false,
                    isLastAttempt: false,
                    delaySeconds,
                    reason: 'persist_write_failed',
                  });
                  emitWorkerLog(
                    env,
                    'error',
                    'photo_mark_failed_error',
                    {
                      area: AREA,
                      component: COMPONENT,
                      operation: 'mark_photo_failed',
                      photo_id: job.photo_id,
                      cause: String(writeResult.error),
                    },
                    ctx,
                  );
                  message.retry({ delaySeconds });
                  rootSpan.end('error', {
                    attributes: {
                      'error.type': persistErr.type,
                      'worker.retry': true,
                      'worker.retry_delay_seconds': delaySeconds,
                    },
                    statusMessage: persistErr.type,
                  });
                  emitJobMetrics('error');
                } else if (isLastAttempt) {
                  emitRetryDecision({
                    decision: 'ack',
                    errorType: persistErr.type,
                    errorName: persistErr.type,
                    retryable: false,
                    throttle: false,
                    isLastAttempt: true,
                    reason: 'persist_error_last_attempt',
                  });
                  message.ack();
                  rootSpan.end('error', {
                    attributes: {
                      'error.type': persistErr.type,
                      'worker.retry': false,
                    },
                    statusMessage: persistErr.type,
                  });
                  emitWorkflowTerminalSpan('error', {
                    attributes: {
                      'error.type': persistErr.type,
                    },
                    statusMessage: persistErr.type,
                  });
                  emitUploadE2EMetrics('error', persistErr.type);
                  emitJobMetrics('error');
                } else {
                  const delaySeconds = getBackoffDelay(message.attempts);
                  emitRetryDecision({
                    decision: 'retry',
                    errorType: persistErr.type,
                    errorName: persistErr.type,
                    retryable: true,
                    throttle: false,
                    isLastAttempt: false,
                    delaySeconds,
                    reason: 'persist_error_retryable',
                  });
                  message.retry({ delaySeconds });
                  rootSpan.end('error', {
                    attributes: {
                      'error.type': persistErr.type,
                      'worker.retry': true,
                      'worker.retry_delay_seconds': delaySeconds,
                    },
                    statusMessage: persistErr.type,
                  });
                  emitJobMetrics('error');
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
          const delaySeconds = delayFn(message.attempts);

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
            emitRetryDecision({
              decision: 'retry',
              errorType: error.type,
              errorName,
              retryable: true,
              throttle,
              isLastAttempt: false,
              delaySeconds,
              reason: 'mark_failed_write_error',
            });
            emitWorkerLog(
              env,
              'error',
              'photo_mark_failed_error',
              {
                area: AREA,
                component: COMPONENT,
                operation: 'mark_photo_failed',
                photo_id: job.photo_id,
                cause: String(writeResult.error),
              },
              ctx,
            );
            message.retry({ delaySeconds });
            rootSpan.end('error', {
              attributes: {
                'error.type': error.type,
                'worker.retry': true,
                'worker.retry_delay_seconds': delaySeconds,
              },
              statusMessage: errorName,
            });
            emitJobMetrics('error');
          } else if (!retryable || isLastAttempt) {
            emitRetryDecision({
              decision: 'ack',
              errorType: error.type,
              errorName,
              retryable,
              throttle,
              isLastAttempt,
              reason: retryable ? 'last_attempt_exhausted' : 'non_retryable_error',
            });
            message.ack();
            rootSpan.end('error', {
              attributes: {
                'error.type': error.type,
                'worker.retry': false,
              },
              statusMessage: errorName,
            });
            emitWorkflowTerminalSpan('error', {
              attributes: {
                'error.type': error.type,
              },
              statusMessage: errorName,
            });
            emitUploadE2EMetrics('error', error.type);
            emitJobMetrics('error');
          } else {
            emitRetryDecision({
              decision: 'retry',
              errorType: error.type,
              errorName,
              retryable,
              throttle,
              isLastAttempt,
              delaySeconds,
              reason: throttle ? 'throttle_backoff' : 'retryable_error',
            });
            message.retry({ delaySeconds });
            rootSpan.end('error', {
              attributes: {
                'error.type': error.type,
                'worker.retry': true,
                'worker.retry_delay_seconds': delaySeconds,
              },
              statusMessage: errorName,
            });
            emitJobMetrics('error');
          }
        },
      );
  }

  emitWorkerLog(
    env,
    'info',
    'photo_batch_complete',
    {
      area: AREA,
      component: COMPONENT,
      operation: 'process_batch',
      queue: 'photo-processing',
      batch_size: batch.messages.length,
      success_count: successCount,
      fail_count: failCount,
    },
    ctx,
  );
}
