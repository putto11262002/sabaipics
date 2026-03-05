/**
 * Upload Orchestrator Consumer (v2 core flow, no observability noise)
 *
 * NOTE: not wired in index.ts yet.
 */

import { createDb, createDbTx, photoJobs, uploadIntents } from '@/db';
import { and, eq } from 'drizzle-orm';
import type { Bindings } from '../types';
import type { R2EventMessage } from '../types/r2-event';
import { normalizeWithCfImages } from '../lib/images/normalize';
import { validateImageMagicBytes } from '../lib/images';
import { debitCreditsIfNotExists } from '../lib/credits';
import { generatePresignedGetUrl, generatePresignedPutUrl } from '../lib/r2/presign';
import { startUploadOrchestration } from '../lib/modal-orchestrator-client';
import type { StartUploadOrchestrationRequest } from '../types/orchestration-job';

const BASE_UPLOAD_OPERATION_TYPE = 'image_upload';

function isUploadEvent(event: R2EventMessage): boolean {
  if (event.action !== 'PutObject' && event.action !== 'CompleteMultipartUpload') return false;
  return event.object.key.startsWith('uploads/');
}

function callbackUrlFromEnv(env: Bindings): string | null {
  const raw = (env as unknown as Record<string, unknown>).API_BASE_URL;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  return `${raw.replace(/\/+$/, '')}/internal/orchestration/callback`;
}

function toSource(value: string | null): 'web' | 'ios' | 'ftp' {
  if (value === 'ios' || value === 'ftp') return value;
  return 'web';
}

async function ensurePhotoJob(env: Bindings, uploadIntentId: string, eventId: string, photographerId: string) {
  const db = createDb(env.DATABASE_URL);
  const existing = await db.query.photoJobs.findFirst({ where: eq(photoJobs.uploadIntentId, uploadIntentId) });
  if (existing) return existing;

  const [created] = await db
    .insert(photoJobs)
    .values({
      uploadIntentId,
      eventId,
      photographerId,
      status: 'pending',
      attempt: 1,
      maxAttempts: 3,
    })
    .returning();

  return created;
}

async function processOne(event: R2EventMessage, env: Bindings): Promise<{ retry: boolean }> {
  const db = createDb(env.DATABASE_URL);
  const dbTx = createDbTx(env.DATABASE_URL);

  const intent = await db.query.uploadIntents.findFirst({ where: eq(uploadIntents.r2Key, event.object.key) });
  if (!intent) return { retry: false };

  if (intent.status === 'completed' || intent.status === 'failed' || intent.status === 'expired') {
    return { retry: false };
  }

  const [claimed] = await db
    .update(uploadIntents)
    .set({ status: 'processing', errorCode: null, errorMessage: null, retryable: null })
    .where(and(eq(uploadIntents.id, intent.id), eq(uploadIntents.status, 'pending')))
    .returning();

  if (!claimed) {
    // Already claimed by another worker; safe to ack.
    return { retry: false };
  }

  const job = await ensurePhotoJob(env, claimed.id, claimed.eventId, claimed.photographerId);

  const callbackUrl = callbackUrlFromEnv(env);
  if (!callbackUrl) {
    await db
      .update(photoJobs)
      .set({
        status: 'failed',
        errorCode: 'config_error',
        errorMessage: 'Missing API_BASE_URL',
        retryable: false,
      })
      .where(eq(photoJobs.id, job.id));
    return { retry: false };
  }

  // Read uploaded bytes, validate, normalize, write canonical original.
  const uploaded = await env.PHOTOS_BUCKET.get(claimed.r2Key);
  if (!uploaded) {
    await db
      .update(uploadIntents)
      .set({ status: 'failed', errorCode: 'object_missing', errorMessage: 'Uploaded object not found', retryable: false })
      .where(eq(uploadIntents.id, claimed.id));
    await db
      .update(photoJobs)
      .set({ status: 'failed', errorCode: 'object_missing', errorMessage: 'Uploaded object not found', retryable: false })
      .where(eq(photoJobs.id, job.id));
    return { retry: false };
  }

  const uploadedBytes = new Uint8Array(await uploaded.arrayBuffer());
  const magic = validateImageMagicBytes(uploadedBytes);
  if (!magic.valid) {
    await db
      .update(uploadIntents)
      .set({ status: 'failed', errorCode: 'invalid_magic_bytes', errorMessage: 'Invalid image format', retryable: false })
      .where(eq(uploadIntents.id, claimed.id));
    await db
      .update(photoJobs)
      .set({ status: 'failed', errorCode: 'invalid_magic_bytes', errorMessage: 'Invalid image format', retryable: false })
      .where(eq(photoJobs.id, job.id));
    return { retry: false };
  }

  const normalized = await normalizeWithCfImages(uploadedBytes.buffer as ArrayBuffer, env.IMAGES);
  if (normalized.isErr()) {
    await db
      .update(uploadIntents)
      .set({ status: 'failed', errorCode: 'normalization_failed', errorMessage: 'CF normalization failed', retryable: true })
      .where(eq(uploadIntents.id, claimed.id));
    await db
      .update(photoJobs)
      .set({ status: 'failed', errorCode: 'normalization_failed', errorMessage: 'CF normalization failed', retryable: true })
      .where(eq(photoJobs.id, job.id));
    return { retry: true };
  }

  const originalR2Key = `events/${claimed.eventId}/${claimed.id}/original.jpeg`;
  const processedR2Key = `events/${claimed.eventId}/${claimed.id}/processed.jpeg`;

  await env.PHOTOS_BUCKET.put(originalR2Key, normalized.value.bytes, {
    httpMetadata: { contentType: 'image/jpeg' },
  });

  // Pre-debit credit once per upload intent.
  const debitResult = await dbTx.transaction(async (tx) => {
    const debit = await debitCreditsIfNotExists(tx, {
      photographerId: claimed.photographerId,
      amount: 1,
      operationType: BASE_UPLOAD_OPERATION_TYPE,
      operationId: claimed.id,
    });
    if (debit.isErr()) throw debit.error;
    return debit.value;
  }).catch((error) => ({ error }));

  if ('error' in debitResult) {
    await db
      .update(uploadIntents)
      .set({ status: 'failed', errorCode: 'insufficient_credits', errorMessage: 'Insufficient credits', retryable: true })
      .where(eq(uploadIntents.id, claimed.id));
    await db
      .update(photoJobs)
      .set({ status: 'failed', errorCode: 'insufficient_credits', errorMessage: 'Insufficient credits', retryable: true })
      .where(eq(photoJobs.id, job.id));
    return { retry: false };
  }

  await db
    .update(photoJobs)
    .set({
      status: 'submitted',
      startedAt: new Date().toISOString(),
      originalR2Key,
      processedR2Key,
      creditsDebited: 1,
      retryable: null,
      errorCode: null,
      errorMessage: null,
    })
    .where(eq(photoJobs.id, job.id));

  const [presignedGet, presignedPut] = await Promise.all([
    generatePresignedGetUrl(env.CF_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, {
      bucket: env.PHOTO_BUCKET_NAME,
      key: originalR2Key,
      expiresIn: 300,
    }),
    generatePresignedPutUrl(env.CF_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, {
      bucket: env.PHOTO_BUCKET_NAME,
      key: processedR2Key,
      contentType: 'image/jpeg',
      expiresIn: 300,
    }),
  ]);

  const request: StartUploadOrchestrationRequest = {
    jobId: job.id,
    eventId: claimed.eventId,
    photographerId: claimed.photographerId,
    source: toSource(claimed.source),
    sourceR2Key: claimed.r2Key,
    originalR2Key,
    processedR2Key,
    contentType: claimed.contentType,
    contentLength: claimed.contentLength,
    inputUrl: presignedGet.url,
    outputUrl: presignedPut.url,
    outputHeaders: {
      'Content-Type': 'image/jpeg',
      'If-None-Match': '*',
    },
    extractImageUrl: `${env.PHOTO_R2_BASE_URL}/${processedR2Key}`,
    callback: {
      url: callbackUrl,
      token: (env as unknown as Record<string, string | undefined>).ORCHESTRATOR_CALLBACK_TOKEN,
    },
  };

  const submit = await startUploadOrchestration(env, request);
  if (submit.isErr()) {
    await db
      .update(photoJobs)
      .set({
        status: 'failed',
        errorCode: submit.error.type,
        errorMessage: submit.error.message,
        retryable: submit.error.retryable,
      })
      .where(eq(photoJobs.id, job.id));

    // Let retryable remote/config/network errors retry from queue level.
    return { retry: submit.error.retryable };
  }

  await db
    .update(photoJobs)
    .set({
      orchestratorRunId: submit.value.runId,
      status: submit.value.phase === 'failed' ? 'failed' : 'submitted',
      errorCode: submit.value.error?.code ?? null,
      errorMessage: submit.value.error?.message ?? null,
      retryable: submit.value.error?.retryable ?? null,
    })
    .where(eq(photoJobs.id, job.id));

  return { retry: submit.value.phase === 'failed' ? Boolean(submit.value.error?.retryable) : false };
}

export async function queue(
  batch: MessageBatch<R2EventMessage>,
  env: Bindings,
): Promise<void> {
  for (const message of batch.messages) {
    const event = message.body;

    if (!isUploadEvent(event)) {
      message.ack();
      continue;
    }

    try {
      const outcome = await processOne(event, env);
      if (outcome.retry) {
        message.retry();
      } else {
        message.ack();
      }
    } catch {
      message.retry();
    }
  }
}
