/**
 * Photo Pipeline Consumer
 *
 * Per-message processing: R2 event → HEAD check → claim intent → debit credits →
 * normalize via CF Images binding (streaming) → insert photo as "indexing" →
 * ACK immediately → fire recognition job to Modal (fire-and-forget).
 *
 * Photos become visible to guests immediately after normalization.
 * Recognition (face detection + embedding) happens asynchronously.
 */

import { createDb, events, photos, photoJobs, uploadIntents, autoEditPresets } from '@/db';
import { and, eq } from 'drizzle-orm';
import { ResultAsync, safeTry, ok, err, errAsync } from 'neverthrow';
import type { Bindings } from '../types';
import type { R2EventMessage } from '../types/r2-event';
import type { PipelineSingleJobRequest, PipelineJob } from '../types/pipeline';
import type { CreditError } from '../lib/credits';
import { fastDebitBalanceIfNotExists } from '../lib/credits/fast-debit';
import type { CreditRefundMessage } from '../types/credit-queue';
import { generatePresignedGetUrl, generatePresignedPutUrl } from '../lib/r2/presign';
import { createInstrument } from '../lib/observability/instrument';

const MAX_OBJECT_SIZE = 50 * 1024 * 1024; // 50 MB
const PRESIGN_EXPIRY_SECONDS = 600; // 10 min
const MODAL_TIMEOUT_MS = 180_000;
const MODAL_BASE_RETRY_DELAY_MS = 10_000;
const MODAL_MAX_RETRIES = 2;
const NORMALIZE_MAX_PX = 2500;

// =============================================================================
// Error types
// =============================================================================

type PipelineError =
  | { type: 'skip'; reason: string }
  | { type: 'not_found'; entity: string; key: string }
  | { type: 'too_large'; size: number }
  | { type: 'already_terminal'; intentId: string; status: string }
  | { type: 'cas_failed'; intentId: string }
  | { type: 'insufficient_credits'; photographerId: string }
  | { type: 'database'; operation: string; cause: unknown }
  | { type: 'presign_failed'; cause: unknown }
  | { type: 'normalize_failed'; cause: unknown }
  | { type: 'modal_submit_failed'; error: string };

// =============================================================================
// Pipeline steps (pure business logic)
// =============================================================================

function headCheckR2(
  env: Bindings,
  event: R2EventMessage,
): ResultAsync<R2Object, PipelineError> {
  return ResultAsync.fromPromise(
    env.PHOTOS_BUCKET.head(event.object.key).then((head) => {
      if (!head) throw { type: 'not_found', entity: 'r2_object', key: event.object.key };
      if (head.size > MAX_OBJECT_SIZE) throw { type: 'too_large', size: head.size };
      return head;
    }),
    (e): PipelineError => {
      if (e && typeof e === 'object' && 'type' in e) return e as PipelineError;
      return { type: 'database', operation: 'head_r2', cause: e };
    },
  );
}

function matchIntent(
  db: ReturnType<typeof createDb>,
  r2Key: string,
): ResultAsync<typeof uploadIntents.$inferSelect, PipelineError> {
  return ResultAsync.fromPromise(
    db.query.uploadIntents.findFirst({
      where: eq(uploadIntents.r2Key, r2Key),
    }).then((intent) => {
      if (!intent) throw { type: 'not_found', entity: 'upload_intent', key: r2Key };
      if (intent.status === 'completed' || intent.status === 'failed' || intent.status === 'expired') {
        throw { type: 'already_terminal', intentId: intent.id, status: intent.status };
      }
      return intent;
    }),
    (e): PipelineError => {
      if (e && typeof e === 'object' && 'type' in e) return e as PipelineError;
      return { type: 'database', operation: 'match_intent', cause: e };
    },
  );
}

function casClaimIntent(
  db: ReturnType<typeof createDb>,
  intentId: string,
): ResultAsync<typeof uploadIntents.$inferSelect, PipelineError> {
  return ResultAsync.fromPromise(
    db
      .update(uploadIntents)
      .set({ status: 'processing', errorCode: null, errorMessage: null, retryable: null })
      .where(and(eq(uploadIntents.id, intentId), eq(uploadIntents.status, 'pending')))
      .returning()
      .then(([claimed]) => {
        if (!claimed) throw { type: 'cas_failed', intentId };
        return claimed;
      }),
    (e): PipelineError => {
      if (e && typeof e === 'object' && 'type' in e) return e as PipelineError;
      return { type: 'database', operation: 'cas_claim', cause: e };
    },
  );
}

function ensurePhotoJob(
  db: ReturnType<typeof createDb>,
  intent: typeof uploadIntents.$inferSelect,
): ResultAsync<typeof photoJobs.$inferSelect, PipelineError> {
  return ResultAsync.fromPromise(
    (async () => {
      const existing = await db.query.photoJobs.findFirst({
        where: eq(photoJobs.uploadIntentId, intent.id),
      });
      if (existing) return existing;

      const [created] = await db
        .insert(photoJobs)
        .values({
          uploadIntentId: intent.id,
          eventId: intent.eventId,
          photographerId: intent.photographerId,
          status: 'pending',
          attempt: 1,
          maxAttempts: 3,
        })
        .returning();
      return created;
    })(),
    (cause): PipelineError => ({ type: 'database', operation: 'ensure_photo_job', cause }),
  );
}

interface DebitContext {
  intent: typeof uploadIntents.$inferSelect;
  job: typeof photoJobs.$inferSelect;
  creditsToDebit: number;
  hasAutoEdit: boolean;
}

function preDebitCredits(
  db: ReturnType<typeof createDb>,
  env: Bindings,
  ctx: DebitContext,
): ResultAsync<DebitContext, PipelineError> {
  return fastDebitBalanceIfNotExists(db, env.CREDIT_QUEUE, {
    photographerId: ctx.intent.photographerId,
    amount: ctx.creditsToDebit,
    operationType: 'image_upload',
    operationId: ctx.intent.id,
    source: 'upload',
    intentId: ctx.intent.id,
  })
    .mapErr((e): PipelineError =>
      e.type === 'insufficient_credits'
        ? { type: 'insufficient_credits', photographerId: ctx.intent.photographerId }
        : { type: 'database', operation: 'debit_credits', cause: e.cause },
    )
    .map(() => ctx);
}

interface NormalizeResult {
  width: number | null;
  height: number | null;
  fileSize: number | null;
}

/**
 * Normalize image via CF Images binding (streaming — no memory bloat).
 * Reads from R2 → transforms at edge → streams back to R2.
 * Returns dimensions and file size of the normalized image.
 */
function normalizeImage(
  env: Bindings,
  sourceR2Key: string,
  destR2Key: string,
): ResultAsync<NormalizeResult, PipelineError> {
  return ResultAsync.fromPromise(
    (async () => {
      const r2Obj = await env.PHOTOS_BUCKET.get(sourceR2Key);
      if (!r2Obj || !r2Obj.body) {
        throw { type: 'not_found', entity: 'r2_object', key: sourceR2Key };
      }

      // CF Images binding: input(stream) → transform → output → response
      // The entire chain must be awaited; .output() returns a promise.
      const transformed = await env.IMAGES
        .input(r2Obj.body)
        .transform({
          width: NORMALIZE_MAX_PX,
          height: NORMALIZE_MAX_PX,
          fit: 'scale-down',
        })
        .output({ format: 'image/jpeg', quality: 90 });

      const response = transformed.response();
      if (!response.ok) {
        throw new Error(`CF Images transform failed: HTTP ${response.status}`);
      }

      // Stream directly to R2
      await env.PHOTOS_BUCKET.put(destR2Key, response.body, {
        httpMetadata: { contentType: 'image/jpeg' },
      });

      // HEAD to get file size
      const head = await env.PHOTOS_BUCKET.head(destR2Key);

      return {
        width: null,  // Set by recognition callback
        height: null, // Set by recognition callback
        fileSize: head?.size ?? null,
      };
    })(),
    (e): PipelineError => {
      if (e && typeof e === 'object' && 'type' in e) return e as PipelineError;
      const cause = e instanceof Error
        ? `${e.name}: ${e.message}`
        : typeof e === 'string'
          ? e
          : JSON.stringify(e, Object.getOwnPropertyNames(e ?? {}));
      return { type: 'normalize_failed', cause };
    },
  );
}

/**
 * Insert photo as "indexing" — visible to guests immediately.
 */
function insertVisiblePhoto(
  db: ReturnType<typeof createDb>,
  photoId: string,
  eventId: string,
  r2Key: string,
  dimensions: NormalizeResult,
): ResultAsync<void, PipelineError> {
  return ResultAsync.fromPromise(
    db.insert(photos).values({
      id: photoId,
      eventId,
      r2Key,
      status: 'indexing',
      width: dimensions.width,
      height: dimensions.height,
      fileSize: dimensions.fileSize,
    }),
    (cause): PipelineError => ({ type: 'database', operation: 'insert_photo', cause }),
  ).map(() => undefined);
}

function submitSingleJobToModal(
  env: Bindings,
  request: PipelineSingleJobRequest,
): ResultAsync<void, PipelineError> {
  const orchestratorUrl = (env as unknown as Record<string, string | undefined>).MODAL_ORCHESTRATOR_URL;
  const modalKey = (env as unknown as Record<string, string | undefined>).MODAL_KEY?.trim();
  const modalSecret = (env as unknown as Record<string, string | undefined>).MODAL_SECRET?.trim();

  if (!orchestratorUrl || !modalKey || !modalSecret) {
    return errAsync({ type: 'modal_submit_failed', error: 'Missing MODAL_ORCHESTRATOR_URL/MODAL_KEY/MODAL_SECRET' });
  }

  return ResultAsync.fromPromise(
    (async () => {
      const body = JSON.stringify(request);
      const headers = {
        'Content-Type': 'application/json',
        'Modal-Key': modalKey,
        'Modal-Secret': modalSecret,
      };

      for (let attempt = 0; attempt <= MODAL_MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(orchestratorUrl, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(MODAL_TIMEOUT_MS),
          });

          if (response.status === 524 && attempt < MODAL_MAX_RETRIES) {
            const delay = MODAL_BASE_RETRY_DELAY_MS * 2 ** attempt;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Modal rejected: ${response.status} ${text}`);
          }
          return;
        } catch (err) {
          if (attempt < MODAL_MAX_RETRIES) {
            const delay = MODAL_BASE_RETRY_DELAY_MS * 2 ** attempt;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }
    })(),
    (cause): PipelineError => ({
      type: 'modal_submit_failed',
      error: cause instanceof Error ? cause.message : String(cause),
    }),
  );
}

// =============================================================================
// Helpers
// =============================================================================

function isUploadEvent(event: R2EventMessage): boolean {
  if (event.action !== 'PutObject' && event.action !== 'CompleteMultipartUpload') return false;
  return event.object.key.startsWith('uploads/');
}

function callbackUrlFromEnv(env: Bindings): string | null {
  const raw = (env as unknown as Record<string, unknown>).API_BASE_URL;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  return `${raw.replace(/\/+$/, '')}/internal/photo-pipelines/callback`;
}

function toSource(value: string | null): 'web' | 'ios' | 'ftp' {
  if (value === 'ios' || value === 'ftp') return value;
  return 'web';
}

function isSkippable(err: PipelineError): boolean {
  return err.type === 'skip' || err.type === 'not_found' || err.type === 'already_terminal' || err.type === 'cas_failed';
}

// =============================================================================
// Queue handler (per-message processing)
// =============================================================================

export async function queue(
  batch: MessageBatch<R2EventMessage>,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  const db = createDb(env.DATABASE_URL);

  // Read trace context from first R2 object's custom metadata
  let parentTraceparent: string | null = null;
  let parentBaggage: string | undefined;
  if (batch.messages.length > 0) {
    const firstKey = batch.messages[0].body.object.key;
    const headForTrace = await env.PHOTOS_BUCKET.head(firstKey).catch(() => null);
    if (headForTrace?.customMetadata) {
      parentTraceparent = headForTrace.customMetadata.traceparent ?? null;
      parentBaggage = headForTrace.customMetadata.baggage;
    }
  }

  const inst = createInstrument({
    env,
    ctx,
    component: 'pipeline_consumer',
    parentTraceparent,
    baggage: parentBaggage,
    baseAttributes: { 'batch.size': batch.messages.length },
  });

  inst.log('info', 'batch_start', { batch_size: batch.messages.length });

  let okCount = 0;
  let failedCount = 0;

  // Process each message independently — normalize + ack, then fire recognition
  await Promise.all(
    batch.messages.map(async (message) => {
      const event = message.body;

      if (!isUploadEvent(event)) {
        message.ack();
        return;
      }

      // Queue wait time
      const eventTimeMs = new Date(event.eventTime).getTime();
      if (eventTimeMs > 0) {
        inst.histogram('queue_wait_ms', Date.now() - eventTimeMs);
      }

      const result = await safeTry(async function* () {
        const head = yield* inst
          .traced('head_check', () => headCheckR2(env, event), {
            attributes: { 'r2.key': event.object.key },
          })
          .safeUnwrap();

        const intent = yield* inst
          .traced('match_intent', () => matchIntent(db, event.object.key))
          .safeUnwrap();

        const claimed = yield* inst
          .traced('cas_claim', () => casClaimIntent(db, intent.id))
          .safeUnwrap();

        const job = yield* inst
          .traced('ensure_job', () => ensurePhotoJob(db, claimed))
          .safeUnwrap();

        const eventRecord = yield* inst
          .tracedPromise('load_event', () =>
            db.query.events.findFirst({
              where: eq(events.id, claimed.eventId),
              columns: { settings: true },
            }),
          )
          .safeUnwrap();

        const colorGrade = eventRecord?.settings?.colorGrade;
        const hasAutoEdit = colorGrade?.autoEdit === true || !!colorGrade?.lutId;
        const creditsToDebit = hasAutoEdit ? 2 : 1;

        // Fetch auto-edit preset if configured
        let preset: typeof autoEditPresets.$inferSelect | null = null;
        if (colorGrade?.autoEdit && colorGrade.autoEditPresetId) {
          const presetResult = yield* inst
            .tracedPromise('load_preset', () =>
              db.query.autoEditPresets.findFirst({
                where: eq(autoEditPresets.id, colorGrade.autoEditPresetId!),
              }),
            )
            .safeUnwrap();
          preset = presetResult ?? null;
        }

        // DEBUG: trace auto-edit decision
        inst.log('info', 'auto_edit_decision', {
          has_color_grade: !!colorGrade,
          auto_edit: colorGrade?.autoEdit,
          auto_edit_preset_id: colorGrade?.autoEditPresetId ?? null,
          preset_name: preset?.name ?? null,
          lut_id: colorGrade?.lutId ?? null,
          has_auto_edit: hasAutoEdit,
          credits_to_debit: creditsToDebit,
        });

        yield* inst
          .traced('debit_credits', () =>
            preDebitCredits(db, env, { intent: claimed, job, creditsToDebit, hasAutoEdit }),
          )
          .safeUnwrap();

        yield* inst
          .tracedPromise('update_credits', () =>
            db.update(photoJobs).set({ creditsDebited: creditsToDebit }).where(eq(photoJobs.id, job.id)),
          )
          .safeUnwrap();

        // Normalize at the edge via CF Images binding (streaming)
        const normalizedR2Key = `events/${claimed.eventId}/${claimed.id}/original.jpeg`;

        const normalizeResult = yield* inst
          .traced('normalize', () => normalizeImage(env, claimed.r2Key, normalizedR2Key))
          .safeUnwrap();

        // Insert photo as "indexing" — visible to guests immediately
        const photoId = crypto.randomUUID();

        yield* inst
          .traced('insert_photo', () => insertVisiblePhoto(db, photoId, claimed.eventId, normalizedR2Key, normalizeResult))
          .safeUnwrap();

        // Update intent + job with photoId and R2 keys
        const processedR2Key = hasAutoEdit ? `events/${claimed.eventId}/${claimed.id}/processed.jpeg` : undefined;

        yield* inst
          .tracedPromise('update_intent_and_job', () =>
            Promise.all([
              db.update(uploadIntents)
                .set({ photoId })
                .where(eq(uploadIntents.id, claimed.id)),
              db.update(photoJobs)
                .set({
                  photoId,
                  originalR2Key: normalizedR2Key,
                  processedR2Key: processedR2Key ?? null,
                  startedAt: new Date().toISOString(),
                  status: 'submitted',
                  updatedAt: new Date().toISOString(),
                })
                .where(eq(photoJobs.id, job.id)),
            ]),
          )
          .safeUnwrap();

        // ACK immediately — photo is now visible
        message.ack();

        // Fire recognition job to Modal (non-blocking via ctx.waitUntil)
        const inputGetUrl = yield* inst
          .traced('presign_get', () =>
            ResultAsync.fromPromise(
              generatePresignedGetUrl(env.CF_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, {
                bucket: env.PHOTO_BUCKET_NAME,
                key: normalizedR2Key,
                expiresIn: PRESIGN_EXPIRY_SECONDS,
              }),
              (cause): PipelineError => ({ type: 'presign_failed', cause }),
            ),
          )
          .safeUnwrap();

        let processedPutUrl: { url: string } | undefined;
        if (processedR2Key) {
          processedPutUrl = yield* inst
            .traced('presign_put_processed', () =>
              ResultAsync.fromPromise(
                generatePresignedPutUrl(env.CF_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, {
                  bucket: env.PHOTO_BUCKET_NAME,
                  key: processedR2Key,
                  contentType: 'image/jpeg',
                  expiresIn: PRESIGN_EXPIRY_SECONDS,
                  allowOverwrite: true,
                }),
                (cause): PipelineError => ({ type: 'presign_failed', cause }),
              ),
            )
            .safeUnwrap();
        }

        const callbackUrl = callbackUrlFromEnv(env);
        const callbackToken = (env as unknown as Record<string, string | undefined>).PIPELINE_CALLBACK_TOKEN;

        // Fetch LUT file from R2 if configured
        let lutBase64: string | null = null;
        if (colorGrade?.lutId) {
          const lutR2Key = `luts/${claimed.photographerId}/${colorGrade.lutId}.cube`;
          const lutObj = await env.PHOTOS_BUCKET.get(lutR2Key);
          if (lutObj) {
            const lutBytes = await lutObj.arrayBuffer();
            lutBase64 = btoa(String.fromCharCode(...new Uint8Array(lutBytes)));
          } else {
            inst.log('warn', 'lut_not_found', { lut_id: colorGrade.lutId, r2_key: lutR2Key });
          }
        }

        const pipelineJob: PipelineJob = {
          jobId: job.id,
          photoId,
          eventId: claimed.eventId,
          photographerId: claimed.photographerId,
          source: toSource(claimed.source),
          inputUrl: inputGetUrl.url,
          processedPutUrl: processedPutUrl?.url,
          sourceR2Key: claimed.r2Key,
          originalR2Key: normalizedR2Key,
          processedR2Key,
          contentType: claimed.contentType,
          options: colorGrade
            ? {
                autoEdit: colorGrade.autoEdit,
                autoEditIntensity: colorGrade.autoEditIntensity,
                autoEditPresetId: colorGrade.autoEditPresetId,
                contrast: preset?.contrast ?? undefined,
                brightness: preset?.brightness ?? undefined,
                saturation: preset?.saturation ?? undefined,
                sharpness: preset?.sharpness ?? undefined,
                autoContrast: preset?.autoContrast ?? undefined,
                lutId: colorGrade.lutId,
                lutBase64,
                lutIntensity: colorGrade.lutIntensity,
                maxFaces: 100,
              }
            : { maxFaces: 100 },
        };

        // DEBUG: log what we're sending to Modal
        inst.log('info', 'modal_dispatch_options', {
          job_id: job.id,
          has_processed_put_url: !!processedPutUrl,
          options_auto_edit: pipelineJob.options?.autoEdit ?? null,
          options_lut_id: pipelineJob.options?.lutId ?? null,
          options_lut_base64_len: pipelineJob.options?.lutBase64?.length ?? 0,
          options_auto_edit_intensity: pipelineJob.options?.autoEditIntensity ?? null,
        });

        const singleJobRequest: PipelineSingleJobRequest = {
          job: pipelineJob,
          callback: { url: callbackUrl!, token: callbackToken },
          traceparent: inst.rootSpan.traceparent(),
          baggage: inst.rootSpan.baggage,
        };

        // Fire-and-forget — don't block the consumer
        ctx.waitUntil(
          submitSingleJobToModal(env, singleJobRequest).match(
            () => {
              inst.log('info', 'modal_dispatched', { job_id: job.id, photo_id: photoId });
            },
            async (submitErr) => {
              const errMsg = submitErr.type === 'modal_submit_failed' ? submitErr.error : submitErr.type;
              inst.log('error', 'modal_submit_failed', { job_id: job.id, error: errMsg });
              // Refund credits on modal failure
              const refundable = creditsToDebit;
              if (refundable > 0) {
                await env.CREDIT_QUEUE.send({
                  type: 'refund',
                  photographerId: claimed.photographerId,
                  amount: refundable,
                  source: 'refund',
                  reason: 'modal_submit_failed',
                } satisfies CreditRefundMessage);
              }
              // Mark photo, job, and intent as failed
              const now = new Date().toISOString();
              await Promise.all([
                db.update(photos)
                  .set({ status: 'failed' })
                  .where(eq(photos.id, photoId)),
                db.update(photoJobs)
                  .set({
                    status: 'failed',
                    errorCode: 'modal_submit_failed',
                    errorMessage: 'Modal submission failed',
                    retryable: false,
                    creditsRefunded: refundable,
                    updatedAt: now,
                  })
                  .where(eq(photoJobs.id, job.id)),
                db.update(uploadIntents)
                  .set({
                    status: 'failed',
                    errorCode: 'modal_submit_failed',
                    errorMessage: 'Modal submission failed',
                    retryable: true,
                  })
                  .where(eq(uploadIntents.id, claimed.id)),
              ]);
              inst.count('credit_refund_total', 1, { reason: 'modal_submit_failed' });
            },
          ),
        );

        return ok(undefined);
      }).match(
        () => {
          okCount++;
        },
        async (rawErr) => {
          const pErr = rawErr as PipelineError;
          if ('type' in pErr && pErr.type === 'insufficient_credits') {
            inst.count('credit_insufficient_total', 1);
            await markInsufficientCredits(db, event.object.key).catch(() => {});
            message.ack();
          } else if ('type' in pErr && isSkippable(pErr)) {
            message.ack();
          } else {
            message.retry();
          }
          failedCount++;
        },
      );
    }),
  );

  inst.complete({ total: batch.messages.length, ok: okCount, failed: failedCount });
}

// =============================================================================
// Helpers for error recovery
// =============================================================================

async function markInsufficientCredits(
  db: ReturnType<typeof createDb>,
  r2Key: string,
): Promise<void> {
  const intent = await db.query.uploadIntents.findFirst({
    where: eq(uploadIntents.r2Key, r2Key),
    columns: { id: true },
  });
  if (!intent) return;

  await db
    .update(uploadIntents)
    .set({ status: 'failed', errorCode: 'insufficient_credits', errorMessage: 'Insufficient credits', retryable: true })
    .where(eq(uploadIntents.id, intent.id));

  const job = await db.query.photoJobs.findFirst({
    where: eq(photoJobs.uploadIntentId, intent.id),
    columns: { id: true },
  });
  if (job) {
    await db
      .update(photoJobs)
      .set({ status: 'failed', errorCode: 'insufficient_credits', errorMessage: 'Insufficient credits', retryable: true })
      .where(eq(photoJobs.id, job.id));
  }
}
