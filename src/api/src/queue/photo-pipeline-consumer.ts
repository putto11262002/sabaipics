/**
 * Photo Pipeline V2 Consumer
 *
 * Single-stage pipeline: R2 event → HEAD check → claim intent → debit credits →
 * presign URLs → batch POST to Modal → callback handles completion.
 *
 * No image bytes are read by the CF worker. Modal handles all compute.
 */

import { createDb, createDbTx, events, photoJobs, uploadIntents } from '@/db';
import { and, eq } from 'drizzle-orm';
import type { Bindings } from '../types';
import type { R2EventMessage } from '../types/r2-event';
import type { PipelineBatchRequest, PipelineJob } from '../types/pipeline-v2';
import { debitCreditsIfNotExists } from '../lib/credits';
import { grantCredits } from '../lib/credits';
import { generatePresignedGetUrl, generatePresignedPutUrl } from '../lib/r2/presign';

const MAX_OBJECT_SIZE = 50 * 1024 * 1024; // 50 MB
const PRESIGN_EXPIRY_SECONDS = 600; // 10 min — generous for Modal cold starts
const MODAL_TIMEOUT_MS = 180_000; // generous — Modal's own timeout is 180s

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

interface ClaimedJob {
  job: PipelineJob;
  photoJobId: string;
  message: Message<R2EventMessage>;
}

async function processOne(
  event: R2EventMessage,
  message: Message<R2EventMessage>,
  env: Bindings,
): Promise<ClaimedJob | null> {
  const db = createDb(env.DATABASE_URL);
  const dbTx = createDbTx(env.DATABASE_URL);

  // 1. HEAD R2 object — reject if too large (no image bytes read)
  const head = await env.PHOTOS_BUCKET.head(event.object.key);
  if (!head) { console.log('[photo-pipeline] HEAD not found:', event.object.key); return null; }
  if (head.size > MAX_OBJECT_SIZE) {
    console.log('[photo-pipeline] too large:', head.size);
    return null;
  }

  // 2. Match R2 key → upload_intent
  const intent = await db.query.uploadIntents.findFirst({
    where: eq(uploadIntents.r2Key, event.object.key),
  });
  if (!intent) { console.log('[photo-pipeline] no intent for key:', event.object.key); return null; }

  if (intent.status === 'completed' || intent.status === 'failed' || intent.status === 'expired') {
    console.log('[photo-pipeline] intent already terminal:', intent.id, intent.status);
    return null;
  }

  // 3. CAS claim intent — update where status = 'pending' → 'processing'
  const [claimed] = await db
    .update(uploadIntents)
    .set({ status: 'processing', errorCode: null, errorMessage: null, retryable: null })
    .where(and(eq(uploadIntents.id, intent.id), eq(uploadIntents.status, 'pending')))
    .returning();

  if (!claimed) {
    console.log('[photo-pipeline] CAS claim failed (already claimed):', intent.id, intent.status);
    return null;
  }

  // 4. Create photo_job (idempotent)
  const existing = await db.query.photoJobs.findFirst({
    where: eq(photoJobs.uploadIntentId, claimed.id),
  });
  let job = existing;
  if (!job) {
    const [created] = await db
      .insert(photoJobs)
      .values({
        uploadIntentId: claimed.id,
        eventId: claimed.eventId,
        photographerId: claimed.photographerId,
        status: 'pending',
        attempt: 1,
        maxAttempts: 3,
      })
      .returning();
    job = created;
  }
  if (!job) return null;

  // Load event settings for auto-edit/LUT options
  const eventRecord = await db.query.events.findFirst({
    where: eq(events.id, claimed.eventId),
    columns: { settings: true },
  });
  const colorGrade = eventRecord?.settings?.colorGrade;
  const hasAutoEdit = colorGrade?.autoEdit === true || !!colorGrade?.lutId;

  // 5. Pre-debit credits — 1 base + 1 if auto-edit enabled (max 2)
  const creditsToDebit = hasAutoEdit ? 2 : 1;
  const debitResult = await dbTx.transaction(async (tx) => {
    const debit = await debitCreditsIfNotExists(tx, {
      photographerId: claimed.photographerId,
      amount: creditsToDebit,
      operationType: 'image_upload',
      operationId: claimed.id,
    });
    if (debit.isErr()) throw debit.error;
    return debit.value;
  }).catch((error) => ({ error }));

  if ('error' in debitResult) {
    // Insufficient credits — ack the message, mark as failed with retryable
    await db
      .update(uploadIntents)
      .set({ status: 'failed', errorCode: 'insufficient_credits', errorMessage: 'Insufficient credits', retryable: true })
      .where(eq(uploadIntents.id, claimed.id));
    await db
      .update(photoJobs)
      .set({ status: 'failed', errorCode: 'insufficient_credits', errorMessage: 'Insufficient credits', retryable: true })
      .where(eq(photoJobs.id, job.id));
    return null;
  }

  // Update job with credit info
  await db
    .update(photoJobs)
    .set({ creditsDebited: creditsToDebit })
    .where(eq(photoJobs.id, job.id));

  // 6. Generate presigned URLs
  const originalR2Key = `events/${claimed.eventId}/${claimed.id}/original.jpeg`;
  const processedR2Key = hasAutoEdit ? `events/${claimed.eventId}/${claimed.id}/processed.jpeg` : undefined;

  const presignPromises = [
    generatePresignedGetUrl(env.CF_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, {
      bucket: env.PHOTO_BUCKET_NAME,
      key: event.object.key,
      expiresIn: PRESIGN_EXPIRY_SECONDS,
    }),
    generatePresignedPutUrl(env.CF_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, {
      bucket: env.PHOTO_BUCKET_NAME,
      key: originalR2Key,
      contentType: 'image/jpeg',
      expiresIn: PRESIGN_EXPIRY_SECONDS,
    }),
  ] as const;

  const processedPutPromise = processedR2Key
    ? generatePresignedPutUrl(env.CF_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, {
        bucket: env.PHOTO_BUCKET_NAME,
        key: processedR2Key,
        contentType: 'image/jpeg',
        expiresIn: PRESIGN_EXPIRY_SECONDS,
      })
    : undefined;

  const [inputGet, originalPut, processedPut] = await Promise.all([
    presignPromises[0],
    presignPromises[1],
    processedPutPromise,
  ]);

  // Update job with R2 keys
  await db
    .update(photoJobs)
    .set({
      originalR2Key,
      processedR2Key: processedR2Key ?? null,
      startedAt: new Date().toISOString(),
    })
    .where(eq(photoJobs.id, job.id));

  const pipelineJob: PipelineJob = {
    jobId: job.id,
    eventId: claimed.eventId,
    photographerId: claimed.photographerId,
    source: toSource(claimed.source),
    inputUrl: inputGet.url,
    originalPutUrl: originalPut.url,
    processedPutUrl: processedPut?.url,
    sourceR2Key: claimed.r2Key,
    originalR2Key,
    processedR2Key,
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

  return { job: pipelineJob, photoJobId: job.id, message };
}

async function submitBatchToModal(
  env: Bindings,
  batchRequest: PipelineBatchRequest,
): Promise<{ ok: boolean; error?: string }> {
  const orchestratorUrl = (env as unknown as Record<string, string | undefined>).MODAL_ORCHESTRATOR_URL;
  const modalKey = (env as unknown as Record<string, string | undefined>).MODAL_KEY?.trim();
  const modalSecret = (env as unknown as Record<string, string | undefined>).MODAL_SECRET?.trim();
  const callbackToken = (env as unknown as Record<string, string | undefined>).PIPELINE_CALLBACK_TOKEN;

  console.log('[photo-pipeline] submitBatchToModal:', { orchestratorUrl, hasModalKey: !!modalKey, hasModalSecret: !!modalSecret, hasCallbackToken: !!callbackToken, jobCount: batchRequest.jobs.length });

  if (!orchestratorUrl || !modalKey || !modalSecret) {
    console.error('[photo-pipeline] Missing Modal config');
    return { ok: false, error: 'Missing MODAL_ORCHESTRATOR_URL/MODAL_KEY/MODAL_SECRET' };
  }

  // Attach callback info for Modal to POST results back
  const callbackUrl = callbackUrlFromEnv(env);
  console.log('[photo-pipeline] Callback URL:', callbackUrl);

  const payload = {
    ...batchRequest,
    callback: {
      url: callbackUrl,
      token: callbackToken,
    },
  };

  console.log('[photo-pipeline] POSTing to Modal:', orchestratorUrl);
  const response = await fetch(orchestratorUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Modal-Key': modalKey,
      'Modal-Secret': modalSecret,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(MODAL_TIMEOUT_MS),
  });

  console.log('[photo-pipeline] Modal response:', response.status, response.statusText);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('[photo-pipeline] Modal rejected:', response.status, text);
    return { ok: false, error: `Modal rejected: ${response.status} ${text}` };
  }

  console.log('[photo-pipeline] Modal accepted batch');
  return { ok: true };
}

export async function queue(
  batch: MessageBatch<R2EventMessage>,
  env: Bindings,
): Promise<void> {
  const db = createDb(env.DATABASE_URL);

  // Process all messages in parallel — claim intents, debit credits, presign URLs
  const results = await Promise.all(
    batch.messages.map(async (message) => {
      const event = message.body;
      console.log('[photo-pipeline] received event:', event.action, event.object.key);
      if (!isUploadEvent(event)) {
        console.log('[photo-pipeline] skipped: not an upload event');
        message.ack();
        return null;
      }

      try {
        const claimed = await processOne(event, message, env);
        if (!claimed) {
          console.log('[photo-pipeline] processOne returned null for:', event.object.key);
          message.ack();
          return null;
        }
        console.log('[photo-pipeline] claimed job:', claimed.photoJobId);
        return claimed;
      } catch (err) {
        console.error('[photo-pipeline] processOne threw:', err);
        message.retry();
        return null;
      }
    }),
  );

  // Collect all successfully claimed jobs
  const claimedJobs = results.filter((r): r is ClaimedJob => r !== null);
  if (claimedJobs.length === 0) return;

  // 7-8. Single batch POST to Modal
  const batchRequest: PipelineBatchRequest = {
    jobs: claimedJobs.map((c) => c.job),
  };

  const submitResult = await submitBatchToModal(env, batchRequest);

  if (!submitResult.ok) {
    // Modal call failed — refund credits, mark all jobs as failed, ack messages
    const dbTxConn = createDbTx(env.DATABASE_URL);
    const now = new Date().toISOString();
    await Promise.all(
      claimedJobs.map(async (claimed) => {
        // Look up how many credits were debited for this job
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
              errorMessage: submitResult.error ?? 'Modal batch submission failed',
              retryable: false,
              creditsRefunded: refundable,
              updatedAt: now,
            })
            .where(eq(photoJobs.id, claimed.photoJobId));
        });

        claimed.message.ack();
      }),
    );
    return;
  }

  // 9. Mark all jobs as submitted, ack messages
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
}
