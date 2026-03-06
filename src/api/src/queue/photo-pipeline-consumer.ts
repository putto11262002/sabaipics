/**
 * Photo Pipeline V2 Consumer
 *
 * Single-stage pipeline: R2 event → HEAD check → claim intent → debit credits →
 * presign URLs → batch POST to Modal → callback handles completion.
 *
 * No image bytes are read by the CF worker. Modal handles all compute.
 * Observability is handled by the `instrument` combinator — business logic stays clean.
 */

import { createDb, createDbTx, events, photoJobs, uploadIntents } from '@/db';
import { and, eq } from 'drizzle-orm';
import { ResultAsync, safeTry, ok, err, errAsync } from 'neverthrow';
import type { Bindings } from '../types';
import type { R2EventMessage } from '../types/r2-event';
import type { PipelineBatchRequest, PipelineJob } from '../types/pipeline-v2';
import { debitCreditsIfNotExists, type CreditError } from '../lib/credits';
import { grantCredits } from '../lib/credits';
import { generatePresignedGetUrl, generatePresignedPutUrl } from '../lib/r2/presign';
import { createInstrument, type Instrument, type TracedError } from '../lib/observability/instrument';

const MAX_OBJECT_SIZE = 50 * 1024 * 1024; // 50 MB
const PRESIGN_EXPIRY_SECONDS = 600; // 10 min
const MODAL_TIMEOUT_MS = 180_000;
const MODAL_RETRY_DELAY_MS = 5_000;
const MODAL_MAX_RETRIES = 1;

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
  | { type: 'modal_submit_failed'; error: string };

// =============================================================================
// Pipeline steps (pure business logic — no observability code)
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
  dbTx: ReturnType<typeof createDbTx>,
  ctx: DebitContext,
): ResultAsync<DebitContext, PipelineError> {
  return ResultAsync.fromPromise(
    dbTx.transaction(async (tx) => {
      const debit = await debitCreditsIfNotExists(tx, {
        photographerId: ctx.intent.photographerId,
        amount: ctx.creditsToDebit,
        operationType: 'image_upload',
        operationId: ctx.intent.id,
      });
      if (debit.isErr()) {
        if (debit.error.type === 'insufficient_credits') {
          throw { type: 'insufficient_credits', photographerId: ctx.intent.photographerId };
        }
        throw debit.error;
      }
      return ctx;
    }),
    (e): PipelineError => {
      if (e && typeof e === 'object' && 'type' in e) return e as PipelineError;
      return { type: 'database', operation: 'debit_credits', cause: e };
    },
  );
}

interface PresignedUrls {
  inputGet: { url: string };
  originalPut: { url: string };
  processedPut?: { url: string };
  originalR2Key: string;
  processedR2Key?: string;
}

function generateUrls(
  env: Bindings,
  eventId: string,
  intentId: string,
  sourceR2Key: string,
  hasAutoEdit: boolean,
): ResultAsync<PresignedUrls, PipelineError> {
  const originalR2Key = `events/${eventId}/${intentId}/original.jpeg`;
  const processedR2Key = hasAutoEdit ? `events/${eventId}/${intentId}/processed.jpeg` : undefined;

  return ResultAsync.fromPromise(
    (async () => {
      const [inputGet, originalPut, processedPut] = await Promise.all([
        generatePresignedGetUrl(env.CF_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, {
          bucket: env.PHOTO_BUCKET_NAME,
          key: sourceR2Key,
          expiresIn: PRESIGN_EXPIRY_SECONDS,
        }),
        generatePresignedPutUrl(env.CF_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, {
          bucket: env.PHOTO_BUCKET_NAME,
          key: originalR2Key,
          contentType: 'image/jpeg',
          expiresIn: PRESIGN_EXPIRY_SECONDS,
        }),
        processedR2Key
          ? generatePresignedPutUrl(env.CF_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, {
              bucket: env.PHOTO_BUCKET_NAME,
              key: processedR2Key,
              contentType: 'image/jpeg',
              expiresIn: PRESIGN_EXPIRY_SECONDS,
            })
          : undefined,
      ]);
      return { inputGet, originalPut, processedPut, originalR2Key, processedR2Key };
    })(),
    (cause): PipelineError => ({ type: 'presign_failed', cause }),
  );
}

function submitBatchToModal(
  env: Bindings,
  batchRequest: PipelineBatchRequest,
): ResultAsync<void, PipelineError> {
  const orchestratorUrl = (env as unknown as Record<string, string | undefined>).MODAL_ORCHESTRATOR_URL;
  const modalKey = (env as unknown as Record<string, string | undefined>).MODAL_KEY?.trim();
  const modalSecret = (env as unknown as Record<string, string | undefined>).MODAL_SECRET?.trim();
  const callbackToken = (env as unknown as Record<string, string | undefined>).PIPELINE_CALLBACK_TOKEN;

  if (!orchestratorUrl || !modalKey || !modalSecret) {
    return errAsync({ type: 'modal_submit_failed', error: 'Missing MODAL_ORCHESTRATOR_URL/MODAL_KEY/MODAL_SECRET' });
  }

  const callbackUrl = callbackUrlFromEnv(env);
  const payload = {
    ...batchRequest,
    callback: { url: callbackUrl, token: callbackToken },
  };

  return ResultAsync.fromPromise(
    (async () => {
      const body = JSON.stringify(payload);
      const headers = {
        'Content-Type': 'application/json',
        'Modal-Key': modalKey,
        'Modal-Secret': modalSecret,
      };

      for (let attempt = 0; attempt <= MODAL_MAX_RETRIES; attempt++) {
        const response = await fetch(orchestratorUrl, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(MODAL_TIMEOUT_MS),
        });

        // 524 = CF proxy timeout (Modal cold start). Retry after delay.
        if (response.status === 524 && attempt < MODAL_MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, MODAL_RETRY_DELAY_MS));
          continue;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(`Modal rejected: ${response.status} ${text}`);
        }
        return;
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
// Queue handler
// =============================================================================

interface ClaimedJob {
  job: PipelineJob;
  photoJobId: string;
  message: Message<R2EventMessage>;
}

export async function queue(
  batch: MessageBatch<R2EventMessage>,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  const db = createDb(env.DATABASE_URL);
  const dbTx = createDbTx(env.DATABASE_URL);

  // Read trace context from first R2 object's custom metadata (set by upload route)
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

  // Process all messages in parallel — claim intents, debit credits, presign URLs
  const results = await Promise.all(
    batch.messages.map(async (message): Promise<ClaimedJob | null> => {
      const event = message.body;

      if (!isUploadEvent(event)) {
        message.ack();
        return null;
      }

      // Queue wait time: R2 event creation → consumer pickup
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

        yield* inst
          .traced('debit_credits', () =>
            preDebitCredits(dbTx, { intent: claimed, job, creditsToDebit, hasAutoEdit }),
          )
          .safeUnwrap();

        yield* inst
          .tracedPromise('update_credits', () =>
            db.update(photoJobs).set({ creditsDebited: creditsToDebit }).where(eq(photoJobs.id, job.id)),
          )
          .safeUnwrap();

        const urls = yield* inst
          .traced('presign', () =>
            generateUrls(env, claimed.eventId, claimed.id, claimed.r2Key, hasAutoEdit),
          )
          .safeUnwrap();

        yield* inst
          .tracedPromise('update_r2_keys', () =>
            db.update(photoJobs).set({
              originalR2Key: urls.originalR2Key,
              processedR2Key: urls.processedR2Key ?? null,
              startedAt: new Date().toISOString(),
            }).where(eq(photoJobs.id, job.id)),
          )
          .safeUnwrap();

        const pipelineJob: PipelineJob = {
          jobId: job.id,
          eventId: claimed.eventId,
          photographerId: claimed.photographerId,
          source: toSource(claimed.source),
          inputUrl: urls.inputGet.url,
          originalPutUrl: urls.originalPut.url,
          processedPutUrl: urls.processedPut?.url,
          sourceR2Key: claimed.r2Key,
          originalR2Key: urls.originalR2Key,
          processedR2Key: urls.processedR2Key,
          contentType: claimed.contentType,
          options: colorGrade
            ? {
                autoEdit: colorGrade.autoEdit,
                autoEditIntensity: colorGrade.autoEditIntensity,
                lutId: colorGrade.lutId,
                lutIntensity: colorGrade.lutIntensity,
                maxFaces: 100,
              }
            : { maxFaces: 100 },
        };

        return ok({ job: pipelineJob, photoJobId: job.id, message } as ClaimedJob);
      }).match(
        (claimed): ClaimedJob => claimed,
        async (err): Promise<null> => {
          if ('type' in err && err.type === 'insufficient_credits') {
            inst.count('credit_insufficient_total', 1);
            await markInsufficientCredits(db, event.object.key).catch(() => {});
            // Ack — don't auto-retry. Intent is marked retryable for user-initiated retry.
            message.ack();
            return null;
          }
          if ('type' in err && isSkippable(err as PipelineError)) {
            message.ack();
          } else {
            message.retry();
          }
          return null;
        },
      );

      return result;
    }),
  );

  // Collect claimed jobs
  const claimedJobs = results.filter((r): r is ClaimedJob => r !== null);
  if (claimedJobs.length === 0) {
    inst.complete({ total: batch.messages.length, ok: 0, failed: 0 });
    return;
  }

  // Batch POST to Modal
  const batchRequest: PipelineBatchRequest = {
    jobs: claimedJobs.map((c) => c.job),
    traceparent: inst.rootSpan.traceparent(),
    baggage: inst.rootSpan.baggage,
  };

  const submitResult = await inst.traced('modal_submit', () =>
    submitBatchToModal(env, batchRequest),
  );

  await submitResult.match(
    async () => {
      // Mark all jobs as submitted, ack messages
      const now = new Date().toISOString();
      await Promise.all(
        claimedJobs.map(async (claimed) => {
          await db
            .update(photoJobs)
            .set({ status: 'submitted', updatedAt: now })
            .where(eq(photoJobs.id, claimed.photoJobId));
          claimed.message.ack();
        }),
      );
      inst.complete({ total: batch.messages.length, ok: claimedJobs.length, failed: 0 });
    },
    async () => {
      // Modal failed — refund credits, mark all jobs as failed, ack messages
      const dbTxConn = createDbTx(env.DATABASE_URL);
      const now = new Date().toISOString();
      await Promise.all(
        claimedJobs.map(async (claimed) => {
          const job = await db.query.photoJobs.findFirst({
            where: eq(photoJobs.id, claimed.photoJobId),
            columns: { creditsDebited: true, photographerId: true },
          });
          const refundable = job?.creditsDebited ?? 0;

          await dbTxConn.transaction(async (tx) => {
            if (refundable > 0) {
              const oneYearFromNow = new Date();
              oneYearFromNow.setUTCFullYear(oneYearFromNow.getUTCFullYear() + 1);
              await grantCredits(tx, {
                photographerId: job!.photographerId,
                amount: refundable,
                source: 'refund',
                expiresAt: oneYearFromNow.toISOString(),
              }).match(
                () => {},
                (e) => { throw e; },
              );
            }

            await tx
              .update(photoJobs)
              .set({
                status: 'failed',
                errorCode: 'modal_submit_failed',
                errorMessage: 'Modal batch submission failed',
                retryable: false,
                creditsRefunded: refundable,
                updatedAt: now,
              })
              .where(eq(photoJobs.id, claimed.photoJobId));
          });

          claimed.message.ack();
        }),
      );
      inst.count('credit_refund_total', claimedJobs.length, { reason: 'modal_submit_failed' });
      inst.complete({ total: batch.messages.length, ok: 0, failed: claimedJobs.length });
    },
  );
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
