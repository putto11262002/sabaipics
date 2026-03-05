import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { photoJobs, photos, uploadIntents } from '@/db';
import { grantCredits } from '../lib/credits';
import type { Env } from '../types';

const callbackSchema = z.object({
  runId: z.string().min(1),
  jobId: z.string().uuid(),
  phase: z.enum(['started', 'normalized', 'image_processed', 'face_extracted', 'completed', 'failed']),
  timestamp: z.string(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
      retryable: z.boolean().optional(),
    })
    .optional(),
  artifacts: z
    .object({
      normalizedR2Key: z.string().optional(),
      processedR2Key: z.string().optional(),
      embeddingCount: z.number().int().nonnegative().optional(),
      operationsApplied: z.array(z.string()).optional(),
      outputSize: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const statusOrder = {
  pending: 0,
  submitted: 1,
  completed: 2,
  failed: 2,
} as const;

function mapPhaseToStatus(phase: z.infer<typeof callbackSchema>['phase']) {
  switch (phase) {
    case 'started':
    case 'normalized':
    case 'image_processed':
    case 'face_extracted':
      return 'submitted' as const;
    case 'completed':
      return 'completed' as const;
    case 'failed':
      return 'failed' as const;
  }
}

function oneYearFromNowIso(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}

export const internalOrchestrationRouter = new Hono<Env>().post(
  '/callback',
  zValidator('json', callbackSchema),
  async (c) => {
    const token = (c.env as unknown as Record<string, unknown>).ORCHESTRATOR_CALLBACK_TOKEN;
    const expected = typeof token === 'string' ? token : '';
    const auth = c.req.header('Authorization') ?? '';
    const got = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';

    if (!expected || !got || got !== expected) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid callback token' } }, 401);
    }

    const body = c.req.valid('json');
    const db = c.var.db();
    const dbTx = c.var.dbTx();

    const job = await db.query.photoJobs.findFirst({ where: eq(photoJobs.id, body.jobId) });
    if (!job) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Photo job not found' } }, 404);
    }

    if (job.orchestratorRunId && job.orchestratorRunId !== body.runId) {
      return c.json({ error: { code: 'CONFLICT', message: 'Run id mismatch' } }, 409);
    }

    const nextStatus = mapPhaseToStatus(body.phase);
    if (statusOrder[nextStatus] < statusOrder[job.status]) {
      return c.json({ ok: true, ignored: true });
    }

    const now = new Date().toISOString();

    if (nextStatus === 'completed') {
      const processedR2Key = body.artifacts?.processedR2Key ?? job.processedR2Key;
      if (!processedR2Key) {
        return c.json(
          { error: { code: 'BAD_REQUEST', message: 'Missing processedR2Key for completion' } },
          400,
        );
      }

      const exists = await c.env.PHOTOS_BUCKET.head(processedR2Key);
      if (!exists) {
        return c.json(
          { error: { code: 'BAD_REQUEST', message: 'Processed artifact not found in R2' } },
          400,
        );
      }

      await dbTx.transaction(async (tx) => {
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

        const photoId = intent.photoId ?? crypto.randomUUID();
        if (!intent.photoId) {
          await tx
            .insert(photos)
            .values({
              id: photoId,
              eventId: intent.eventId,
              r2Key: processedR2Key,
              status: 'indexed',
              faceCount: body.artifacts?.embeddingCount ?? 0,
            });
        } else {
          await tx
            .update(photos)
            .set({
              r2Key: processedR2Key,
              status: 'indexed',
              faceCount: body.artifacts?.embeddingCount ?? 0,
              indexedAt: now,
            })
            .where(eq(photos.id, intent.photoId));
        }

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

        await tx
          .update(photoJobs)
          .set({
            status: 'completed',
            orchestratorRunId: body.runId,
            processedR2Key,
            retryable: null,
            errorCode: null,
            errorMessage: null,
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(photoJobs.id, job.id));
      });

      return c.json({ ok: true });
    }

    if (nextStatus === 'failed') {
      await dbTx.transaction(async (tx) => {
        const [locked] = await tx
          .select({
            id: photoJobs.id,
            uploadIntentId: photoJobs.uploadIntentId,
            photographerId: photoJobs.photographerId,
            creditsDebited: photoJobs.creditsDebited,
            creditsRefunded: photoJobs.creditsRefunded,
          })
          .from(photoJobs)
          .where(eq(photoJobs.id, job.id))
          .limit(1);

        if (!locked) throw new Error('Photo job disappeared');

        const refundable = Math.max(0, (locked.creditsDebited ?? 0) - (locked.creditsRefunded ?? 0));
        if (refundable > 0) {
          await grantCredits(tx, {
            photographerId: locked.photographerId,
            amount: refundable,
            source: 'refund',
            expiresAt: oneYearFromNowIso(),
          }).match(
            () => {},
            (e) => {
              throw e;
            },
          );
        }

        await tx
          .update(uploadIntents)
          .set({
            status: 'failed',
            errorCode: body.error?.code ?? 'orchestration_failed',
            errorMessage: body.error?.message ?? 'Orchestration failed',
            retryable: body.error?.retryable ?? true,
          })
          .where(eq(uploadIntents.id, locked.uploadIntentId));

        await tx
          .update(photoJobs)
          .set({
            status: 'failed',
            orchestratorRunId: body.runId,
            errorCode: body.error?.code ?? 'orchestration_failed',
            errorMessage: body.error?.message ?? 'Orchestration failed',
            retryable: body.error?.retryable ?? true,
            creditsRefunded: locked.creditsDebited,
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(photoJobs.id, locked.id));
      });

      return c.json({ ok: true });
    }

    await db
      .update(photoJobs)
      .set({
        status: nextStatus,
        orchestratorRunId: body.runId,
        updatedAt: now,
      })
      .where(eq(photoJobs.id, job.id));

    return c.json({ ok: true });
  },
);

