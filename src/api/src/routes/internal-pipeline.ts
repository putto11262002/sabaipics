/**
 * Photo Pipeline — Callback Endpoint
 *
 * Modal POSTs results here after processing each job.
 * Each job result is handled in its own transaction.
 * Observability via `instrument` combinator — business logic stays clean.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { ResultAsync } from 'neverthrow';
import { events, photoJobs, photos, uploadIntents } from '@/db';
import { insertFaceEmbeddings } from '../lib/recognition/storage';
import type { CreditRefundMessage } from '../types/credit-queue';
import type { DetectedFace } from '../lib/recognition/types';
import type { Env } from '../types';
import type { PipelineApplied } from '@/db';
import { createInstrument } from '../lib/observability/instrument';

// =============================================================================
// Zod schemas
// =============================================================================

const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const detectedFaceSchema = z.object({
  embedding: z.array(z.number()),
  boundingBox: boundingBoxSchema,
  confidence: z.number(),
});

const jobResultSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['completed', 'failed']),
  artifacts: z
    .object({
      originalR2Key: z.string(),
      processedR2Key: z.string().nullish(),
      autoEditSucceeded: z.boolean().nullish(),
      lutApplied: z.boolean().nullish(),
      lutId: z.string().nullish(),
      lutIntensity: z.number().int().nullish(),
      embeddingCount: z.number().int().nonnegative(),
      faces: z.array(detectedFaceSchema),
      exif: z.record(z.unknown()).nullish(),
      width: z.number().int().positive().nullish(),
      height: z.number().int().positive().nullish(),
    })
    .nullish(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .nullish(),
});

const callbackSchema = z.object({
  results: z.array(jobResultSchema).min(1),
  traceparent: z.string().nullish(),
  baggage: z.string().nullish(),
});

// =============================================================================
// Error types
// =============================================================================

type CallbackError =
  | { type: 'not_found'; jobId: string }
  | { type: 'already_terminal'; jobId: string; status: string }
  | { type: 'database'; operation: string; cause: unknown }
  | { type: 'face_embedding'; cause: unknown };

// =============================================================================
// Business logic (pure — no observability code)
// =============================================================================

type JobResultInput = z.infer<typeof jobResultSchema>;

function processCompletedResult(
  dbTx: ReturnType<typeof import('@/db').createDbTx>,
  creditQueue: Queue<CreditRefundMessage>,
  job: typeof photoJobs.$inferSelect,
  result: JobResultInput,
  now: string,
): ResultAsync<{ jobId: string; faceCount: number }, CallbackError> {
  const artifacts = result.artifacts!;

  return ResultAsync.fromPromise(
    (async () => {
      const txResult = await dbTx.transaction(async (tx) => {
        // Look up intent
        const [intent] = await tx
          .select({
            id: uploadIntents.id,
            eventId: uploadIntents.eventId,
            photoId: uploadIntents.photoId,
          })
          .from(uploadIntents)
          .where(eq(uploadIntents.id, job.uploadIntentId))
          .limit(1);

        if (!intent) throw new Error('Upload intent missing for photo job');

        // Look up event settings for autoEditPresetId
        const [eventRecord] = await tx
          .select({ settings: events.settings })
          .from(events)
          .where(eq(events.id, intent.eventId))
          .limit(1);

        // photoId from job (created during normalization) or intent, fallback to new UUID
        const photoId = job.photoId ?? intent.photoId ?? crypto.randomUUID();

        // Determine photo R2 key — prefer processed if auto-edit succeeded
        const photoR2Key =
          artifacts.processedR2Key && artifacts.autoEditSucceeded !== false
            ? artifacts.processedR2Key
            : artifacts.originalR2Key;

        const pipelineApplied: PipelineApplied = {
          autoEdit: artifacts.autoEditSucceeded ?? false,
          autoEditPresetId: artifacts.autoEditSucceeded
            ? (eventRecord?.settings?.colorGrade?.autoEditPresetId ?? null)
            : null,
          lutId: artifacts.lutApplied ? (artifacts.lutId ?? null) : null,
          lutIntensity: artifacts.lutApplied ? (artifacts.lutIntensity ?? 0) : 0,
        };

        // Photo may already exist as "indexing" (created during normalization).
        // Update it to "indexed" with face data, or insert if not exists.
        const existingPhoto = job.photoId
          ? await tx.select({ id: photos.id }).from(photos).where(eq(photos.id, photoId)).limit(1).then(r => r[0])
          : null;

        if (existingPhoto) {
          // Update existing "indexing" photo → "indexed"
          await tx
            .update(photos)
            .set({
              r2Key: photoR2Key,
              status: 'indexed',
              faceCount: artifacts.embeddingCount,
              width: artifacts.width,
              height: artifacts.height,
              exif: artifacts.exif as any,
              pipelineApplied,
              indexedAt: now,
            })
            .where(eq(photos.id, photoId));
        } else {
          // Fallback: insert new photo directly as "indexed"
          await tx.insert(photos).values({
            id: photoId,
            eventId: intent.eventId,
            r2Key: photoR2Key,
            status: 'indexed',
            faceCount: artifacts.embeddingCount,
            width: artifacts.width,
            height: artifacts.height,
            exif: artifacts.exif as any,
            pipelineApplied,
            indexedAt: now,
          });
        }

        // Insert face embeddings
        if (artifacts.faces.length > 0) {
          await insertFaceEmbeddings(tx, photoId, artifacts.faces as DetectedFace[]).match(
            () => {},
            (e) => { throw e; },
          );
        }

        // Track refund in DB if auto-edit was expected but failed
        const needsAutoEditRefund = artifacts.autoEditSucceeded === false && (job.creditsDebited ?? 0) >= 2;
        if (needsAutoEditRefund) {
          await tx
            .update(photoJobs)
            .set({ creditsRefunded: 1 })
            .where(eq(photoJobs.id, job.id));
        }

        // Mark upload intent completed
        await tx
          .update(uploadIntents)
          .set({
            status: 'completed',
            completedAt: now,
            photoId,
            errorCode: null,
            errorMessage: null,
            retryable: null,
          })
          .where(eq(uploadIntents.id, intent.id));

        // Mark photo job completed
        await tx
          .update(photoJobs)
          .set({
            status: 'completed',
            originalR2Key: artifacts.originalR2Key,
            processedR2Key: artifacts.processedR2Key ?? null,
            retryable: null,
            errorCode: null,
            errorMessage: null,
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(photoJobs.id, job.id));

        return { jobId: job.id, faceCount: artifacts.embeddingCount, needsAutoEditRefund };
      });

      // Send refund to credit queue after transaction commits
      if (txResult.needsAutoEditRefund) {
        await creditQueue.send({
          type: 'refund',
          photographerId: job.photographerId,
          amount: 1,
          source: 'refund',
          reason: 'auto_edit_failed',
        });
      }

      return { jobId: txResult.jobId, faceCount: txResult.faceCount };
    })(),
    (cause): CallbackError => ({ type: 'database', operation: 'process_completed', cause }),
  );
}

function processFailedResult(
  dbTx: ReturnType<typeof import('@/db').createDbTx>,
  creditQueue: Queue<CreditRefundMessage>,
  job: typeof photoJobs.$inferSelect,
  result: JobResultInput,
  now: string,
): ResultAsync<{ jobId: string; refunded: number }, CallbackError> {
  return ResultAsync.fromPromise(
    (async () => {
      const refundable = Math.max(0, (job.creditsDebited ?? 0) - (job.creditsRefunded ?? 0));

      await dbTx.transaction(async (tx) => {
        await tx
          .update(uploadIntents)
          .set({
            status: 'failed',
            errorCode: result.error?.code ?? 'pipeline_failed',
            errorMessage: result.error?.message ?? 'Pipeline processing failed',
            retryable: false,
          })
          .where(eq(uploadIntents.id, job.uploadIntentId));

        await tx
          .update(photoJobs)
          .set({
            status: 'failed',
            errorCode: result.error?.code ?? 'pipeline_failed',
            errorMessage: result.error?.message ?? 'Pipeline processing failed',
            retryable: false,
            creditsRefunded: job.creditsDebited,
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(photoJobs.id, job.id));

        // Mark photo as failed if it was created during normalization
        if (job.photoId) {
          await tx
            .update(photos)
            .set({ status: 'failed' })
            .where(eq(photos.id, job.photoId));
        }
      });

      // Send refund to credit queue after transaction commits
      if (refundable > 0) {
        await creditQueue.send({
          type: 'refund',
          photographerId: job.photographerId,
          amount: refundable,
          source: 'refund',
          reason: 'pipeline_failed',
        });
      }

      return { jobId: job.id, refunded: refundable };
    })(),
    (cause): CallbackError => ({ type: 'database', operation: 'process_failed', cause }),
  );
}

// =============================================================================
// Route
// =============================================================================

export const internalPipelineRouter = new Hono<Env>().post(
  '/callback',
  zValidator('json', callbackSchema, (result, c) => {
    if (!result.success) {
      console.error('[callback] Validation failed:', JSON.stringify(result.error));
      return c.json({ error: { code: 'INVALID_PAYLOAD', message: result.error.message } }, 400);
    }
  }),
  async (c) => {
    // Bearer token auth
    const token = (c.env as unknown as Record<string, unknown>).PIPELINE_CALLBACK_TOKEN;
    const expected = typeof token === 'string' ? token : '';
    const auth = c.req.header('Authorization') ?? '';
    const got = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';

    if (!expected || !got || got !== expected) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid callback token' } }, 401);
    }

    const body = c.req.valid('json');
    const dbTx = c.var.dbTx();
    const db = c.var.db();
    const now = new Date().toISOString();

    const inst = createInstrument({
      env: c.env as any,
      ctx: c.executionCtx as unknown as ExecutionContext,
      component: 'pipeline_callback',
      parentTraceparent: body.traceparent ?? null,
      baggage: body.baggage ?? undefined,
      baseAttributes: { 'callback.result_count': body.results.length },
    });

    inst.log('info', 'received', { result_count: body.results.length });

    const outcomes: Array<{ jobId: string; ok: boolean; error?: string }> = [];
    let okCount = 0;
    let failedCount = 0;

    for (const result of body.results) {
      // Look up job
      const jobResult = await inst.tracedPromise(
        'lookup_job',
        () => db.query.photoJobs.findFirst({ where: eq(photoJobs.id, result.jobId) }),
        { attributes: { 'job.id': result.jobId } },
      );

      if (jobResult.isErr()) {
        outcomes.push({ jobId: result.jobId, ok: false, error: jobResult.error.message });
        failedCount++;
        continue;
      }

      const job = jobResult.value;
      if (!job) {
        outcomes.push({ jobId: result.jobId, ok: false, error: 'not_found' });
        failedCount++;
        continue;
      }

      // Skip already terminal
      if (job.status === 'completed' || job.status === 'failed') {
        outcomes.push({ jobId: result.jobId, ok: true });
        okCount++;
        continue;
      }

      if (result.status === 'completed' && result.artifacts) {
        const processResult = await inst.traced(
          'process_completed',
          () => processCompletedResult(dbTx, (c.env as any).CREDIT_QUEUE, job, result, now),
          { attributes: { 'job.id': result.jobId, 'job.face_count': result.artifacts!.embeddingCount } },
        );

        processResult.match(
          (val) => {
            inst.histogram('faces_detected', val.faceCount, {});
            // Compute e2e duration if job has startedAt
            if (job.startedAt) {
              const e2eMs = Math.max(0, Date.now() - new Date(job.startedAt).getTime());
              inst.histogram('e2e_duration_ms', e2eMs, {});
            }
            if (result.artifacts!.autoEditSucceeded === false && (job.creditsDebited ?? 0) >= 2) {
              inst.count('credit_refund_total', 1, { reason: 'auto_edit_failed' });
            }
            outcomes.push({ jobId: result.jobId, ok: true });
            okCount++;
          },
          (err) => {
            outcomes.push({ jobId: result.jobId, ok: false, error: err.type });
            failedCount++;
          },
        );
      } else if (result.status === 'failed') {
        const failResult = await inst.traced(
          'process_failed',
          () => processFailedResult(dbTx, (c.env as any).CREDIT_QUEUE, job, result, now),
          { attributes: { 'job.id': result.jobId, 'error.code': result.error?.code ?? 'unknown' } },
        );

        failResult.match(
          (val) => {
            if (val.refunded > 0) {
              inst.count('credit_refund_total', val.refunded, { reason: 'pipeline_failed' });
            }
            outcomes.push({ jobId: result.jobId, ok: true });
            okCount++;
          },
          (err) => {
            outcomes.push({ jobId: result.jobId, ok: false, error: err.type });
            failedCount++;
          },
        );
      }
    }

    inst.complete({ total: body.results.length, ok: okCount, failed: failedCount });

    return c.json({ ok: true, outcomes });
  },
);
