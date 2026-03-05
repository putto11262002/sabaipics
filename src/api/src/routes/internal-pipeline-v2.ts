/**
 * Photo Pipeline V2 — Callback Endpoint
 *
 * Modal POSTs batch results here after processing all jobs.
 * Each job result is handled in its own transaction.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { photoJobs, photos, uploadIntents } from '@/db';
import { grantCredits } from '../lib/credits';
import { insertFaceEmbeddings } from '../lib/recognition/storage';
import type { DetectedFace } from '../lib/recognition/types';
import type { Env } from '../types';
import type { PipelineApplied } from '@/db';

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
});

function oneYearFromNowIso(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}

export const internalPipelineV2Router = new Hono<Env>().post(
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
    console.log('[callback] Received:', JSON.stringify(body).slice(0, 500));
    const dbTx = c.var.dbTx();
    const db = c.var.db();
    const now = new Date().toISOString();

    const outcomes: Array<{ jobId: string; ok: boolean; error?: string }> = [];

    for (const result of body.results) {
      try {
        const job = await db.query.photoJobs.findFirst({ where: eq(photoJobs.id, result.jobId) });
        if (!job) {
          outcomes.push({ jobId: result.jobId, ok: false, error: 'not_found' });
          continue;
        }

        // Skip if already terminal
        if (job.status === 'completed' || job.status === 'failed') {
          outcomes.push({ jobId: result.jobId, ok: true });
          continue;
        }

        if (result.status === 'completed' && result.artifacts) {
          const artifacts = result.artifacts;
          // Determine which R2 key to use for the photo record.
          // If auto-edit succeeded, use processed key; otherwise use original.
          const photoR2Key = artifacts.processedR2Key && artifacts.autoEditSucceeded !== false
            ? artifacts.processedR2Key
            : artifacts.originalR2Key;

          const pipelineApplied: PipelineApplied = {
            autoEdit: artifacts.autoEditSucceeded ?? false,
            autoEditPresetId: null,
            lutId: null,
            lutIntensity: 0,
          };

          await dbTx.transaction(async (tx) => {
            // Look up intent for photo creation
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

            // Insert or update photo record
            if (!intent.photoId) {
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
            } else {
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
                .where(eq(photos.id, intent.photoId));
            }

            // Insert face embeddings
            if (artifacts.faces.length > 0) {
              await insertFaceEmbeddings(
                tx,
                photoId,
                artifacts.faces as DetectedFace[],
              ).match(
                () => {},
                (e) => { throw e; },
              );
            }

            // Refund 1 credit if auto-edit was expected but failed
            if (artifacts.autoEditSucceeded === false && (job.creditsDebited ?? 0) >= 2) {
              await grantCredits(tx, {
                photographerId: job.photographerId,
                amount: 1,
                source: 'refund',
                expiresAt: oneYearFromNowIso(),
              }).match(
                () => {},
                (e) => { throw e; },
              );

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
          });

          outcomes.push({ jobId: result.jobId, ok: true });
        } else if (result.status === 'failed') {
          await dbTx.transaction(async (tx) => {
            // Refund ALL pre-debited credits
            const refundable = Math.max(0, (job.creditsDebited ?? 0) - (job.creditsRefunded ?? 0));
            if (refundable > 0) {
              await grantCredits(tx, {
                photographerId: job.photographerId,
                amount: refundable,
                source: 'refund',
                expiresAt: oneYearFromNowIso(),
              }).match(
                () => {},
                (e) => { throw e; },
              );
            }

            // Mark upload intent failed
            await tx
              .update(uploadIntents)
              .set({
                status: 'failed',
                errorCode: result.error?.code ?? 'pipeline_failed',
                errorMessage: result.error?.message ?? 'Pipeline processing failed',
                retryable: false,
              })
              .where(eq(uploadIntents.id, job.uploadIntentId));

            // Mark photo job failed
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
          });

          outcomes.push({ jobId: result.jobId, ok: true });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        outcomes.push({ jobId: result.jobId, ok: false, error: message });
      }
    }

    return c.json({ ok: true, outcomes });
  },
);
