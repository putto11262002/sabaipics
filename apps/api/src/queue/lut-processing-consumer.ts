/**
 * LUT Processing Queue Consumer
 *
 * Handles R2 object-create notifications for temporary LUT uploads under:
 * - lut-uploads/
 *
 * For each upload, it:
 * - matches the R2 key to photo_luts.upload_r2_key
 * - marks expired / processing / completed / failed
 * - writes the final .cube to luts/{photographerId}/{lutId}.cube
 * - best-effort deletes the temporary object
 */

import type { R2EventMessage } from '../types/r2-event';
import type { Bindings } from '../types';
import { createDb, photoLuts } from '@sabaipics/db';
import { eq } from 'drizzle-orm';
import { Result, ResultAsync, safeTry, ok, err, type Result as NtResult } from 'neverthrow';
import { PhotonImage } from '@cf-wasm/photon/workerd';
import { validateImageMagicBytes } from '../lib/images';
import { parseCubeLut, generateCubeLutFromReferenceRgba } from '../lib/images/color-grade';
import * as Sentry from '@sentry/cloudflare';

// =============================================================================
// Types
// =============================================================================

type LutProcessingError =
  | { type: 'orphan'; key: string }
  | { type: 'expired'; key: string; lutId: string }
  | { type: 'unsupported_source'; key: string; lutId: string; sourceType: string }
  | { type: 'r2_not_found'; key: string; lutId: string }
  | {
      type: 'invalid_lut';
      key: string;
      lutId: string;
      reason: 'invalid_format' | 'unsupported';
      message: string;
    }
  | {
      type: 'invalid_image';
      key: string;
      lutId: string;
      reason: 'invalid_magic_bytes' | 'decode_failed';
      message: string;
    }
  | { type: 'database'; operation: string; cause: unknown }
  | { type: 'r2'; operation: string; cause: unknown };

// =============================================================================
// Helpers
// =============================================================================

async function bestEffortDeleteTemp(env: Bindings, key: string): Promise<void> {
  try {
    await env.PHOTOS_BUCKET.delete(key);
  } catch (e) {
    console.error(`[lut-processing-consumer] Failed to delete temp object: ${key}`, e);
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = bytes.slice();
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const safePhotonDecode = Result.fromThrowable(
  (bytes: Uint8Array) => PhotonImage.new_from_byteslice(bytes),
  (cause): LutProcessingError => ({
    type: 'invalid_image',
    key: 'unknown',
    lutId: 'unknown',
    reason: 'decode_failed',
    message: cause instanceof Error ? cause.message : 'Failed to decode image',
  }),
);

// =============================================================================
// Processing
// =============================================================================

async function processLutUpload(
  env: Bindings,
  event: R2EventMessage,
): Promise<NtResult<void, LutProcessingError>> {
  return safeTry(async function* () {
    const { key } = event.object;

    // Only process object-create events we care about.
    if (event.action !== 'PutObject' && event.action !== 'CompleteMultipartUpload') {
      return ok(undefined);
    }
    if (!key.startsWith('lut-uploads/')) {
      return ok(undefined);
    }

    const db = createDb(env.DATABASE_URL);

    const lut = yield* ResultAsync.fromPromise(
      db.query.photoLuts.findFirst({ where: eq(photoLuts.uploadR2Key, key) }),
      (cause): LutProcessingError => ({ type: 'database', operation: 'find_lut', cause }),
    );

    if (!lut) {
      return err<never, LutProcessingError>({ type: 'orphan', key });
    }

    // Idempotency: if already terminal, just clean up the temp object.
    if (lut.status === 'completed' || lut.status === 'failed' || lut.status === 'expired') {
      yield* ResultAsync.fromPromise(
        bestEffortDeleteTemp(env, key),
        (cause): LutProcessingError => ({ type: 'r2', operation: 'delete_temp_terminal', cause }),
      );
      return ok(undefined);
    }

    // Expiry check at processing time (event delivery may be delayed).
    // Only apply to pre-processing state: once we've started processing, do not
    // transition to expired on subsequent retries.
    if (lut.status === 'pending' && new Date(lut.expiresAt).getTime() < Date.now()) {
      return err<never, LutProcessingError>({ type: 'expired', key, lutId: lut.id });
    }

    // Mark processing (best-effort idempotent; overwrite any previous error fields).
    yield* ResultAsync.fromPromise(
      db
        .update(photoLuts)
        .set({ status: 'processing', errorCode: null, errorMessage: null })
        .where(eq(photoLuts.id, lut.id)),
      (cause): LutProcessingError => ({ type: 'database', operation: 'mark_processing', cause }),
    );

    const finalR2Key = `luts/${lut.photographerId}/${lut.id}.cube`;
    const now = new Date().toISOString();

    if (lut.sourceType === 'cube') {
      const r2Object = yield* ResultAsync.fromPromise(
        env.PHOTOS_BUCKET.get(key),
        (cause): LutProcessingError => ({ type: 'r2', operation: 'get_temp_cube', cause }),
      );
      if (!r2Object) {
        return err<never, LutProcessingError>({ type: 'r2_not_found', key, lutId: lut.id });
      }

      const text = yield* ResultAsync.fromPromise(
        r2Object.text(),
        (cause): LutProcessingError => ({ type: 'r2', operation: 'read_temp_cube_text', cause }),
      );

      const parsed = parseCubeLut(text);
      if (parsed.isErr()) {
        return err<never, LutProcessingError>({
          type: 'invalid_lut',
          key,
          lutId: lut.id,
          reason: parsed.error.type,
          message: parsed.error.message,
        });
      }

      const normalizedText = text.endsWith('\n') ? text : `${text}\n`;
      const bytes = new TextEncoder().encode(normalizedText);
      const sha256 = yield* ResultAsync.fromPromise(
        sha256Hex(bytes),
        (cause): LutProcessingError => ({ type: 'r2', operation: 'sha256', cause }),
      );

      yield* ResultAsync.fromPromise(
        env.PHOTOS_BUCKET.put(finalR2Key, bytes, {
          httpMetadata: { contentType: 'text/plain' },
        }),
        (cause): LutProcessingError => ({ type: 'r2', operation: 'put_final_cube', cause }),
      );

      yield* ResultAsync.fromPromise(
        db
          .update(photoLuts)
          .set({
            status: 'completed',
            lutR2Key: finalR2Key,
            lutSize: parsed.value.size,
            title: parsed.value.title ?? null,
            domainMin: parsed.value.domainMin ?? null,
            domainMax: parsed.value.domainMax ?? null,
            sha256,
            completedAt: now,
            errorCode: null,
            errorMessage: null,
          })
          .where(eq(photoLuts.id, lut.id)),
        (cause): LutProcessingError => ({
          type: 'database',
          operation: 'mark_completed_cube',
          cause,
        }),
      );

      yield* ResultAsync.fromPromise(
        bestEffortDeleteTemp(env, key),
        (cause): LutProcessingError => ({ type: 'r2', operation: 'delete_temp_cube', cause }),
      );

      return ok(undefined);
    }

    if (lut.sourceType === 'reference_image') {
      const r2Object = yield* ResultAsync.fromPromise(
        env.PHOTOS_BUCKET.get(key),
        (cause): LutProcessingError => ({
          type: 'r2',
          operation: 'get_temp_reference_image',
          cause,
        }),
      );
      if (!r2Object) {
        return err<never, LutProcessingError>({ type: 'r2_not_found', key, lutId: lut.id });
      }

      const imageBytes = new Uint8Array(
        yield* ResultAsync.fromPromise(
          r2Object.arrayBuffer(),
          (cause): LutProcessingError => ({
            type: 'r2',
            operation: 'read_temp_reference_image',
            cause,
          }),
        ),
      );

      const magicValidation = validateImageMagicBytes(imageBytes.slice(0, 16));
      if (!magicValidation.valid) {
        return err<never, LutProcessingError>({
          type: 'invalid_image',
          key,
          lutId: lut.id,
          reason: 'invalid_magic_bytes',
          message: 'Invalid image format (magic bytes check failed)',
        });
      }

      // Decode to RGBA using photon (in-Worker Wasm)
      const photon = yield* safePhotonDecode(imageBytes).mapErr((e) => ({
        ...e,
        key,
        lutId: lut.id,
      }));

      let pixels: Uint8Array;
      let width: number;
      let height: number;
      try {
        width = photon.get_width();
        height = photon.get_height();
        // Copy out of Wasm memory before free.
        pixels = photon.get_raw_pixels().slice();
      } finally {
        photon.free();
      }

      const lutText = generateCubeLutFromReferenceRgba({
        referencePixels: pixels,
        width,
        height,
        size: 33,
        includeLuminance: true,
        title: lut.name,
      });

      const parsed = parseCubeLut(lutText);
      if (parsed.isErr()) {
        return err<never, LutProcessingError>({
          type: 'invalid_lut',
          key,
          lutId: lut.id,
          reason: parsed.error.type,
          message: parsed.error.message,
        });
      }

      const bytes = new TextEncoder().encode(lutText);
      const sha256 = yield* ResultAsync.fromPromise(
        sha256Hex(bytes),
        (cause): LutProcessingError => ({ type: 'r2', operation: 'sha256', cause }),
      );

      yield* ResultAsync.fromPromise(
        env.PHOTOS_BUCKET.put(finalR2Key, bytes, {
          httpMetadata: { contentType: 'text/plain' },
        }),
        (cause): LutProcessingError => ({
          type: 'r2',
          operation: 'put_final_generated_cube',
          cause,
        }),
      );

      yield* ResultAsync.fromPromise(
        db
          .update(photoLuts)
          .set({
            status: 'completed',
            lutR2Key: finalR2Key,
            lutSize: parsed.value.size,
            title: parsed.value.title ?? null,
            domainMin: parsed.value.domainMin ?? null,
            domainMax: parsed.value.domainMax ?? null,
            sha256,
            completedAt: now,
            errorCode: null,
            errorMessage: null,
          })
          .where(eq(photoLuts.id, lut.id)),
        (cause): LutProcessingError => ({
          type: 'database',
          operation: 'mark_completed_reference',
          cause,
        }),
      );

      yield* ResultAsync.fromPromise(
        bestEffortDeleteTemp(env, key),
        (cause): LutProcessingError => ({ type: 'r2', operation: 'delete_temp_reference', cause }),
      );

      return ok(undefined);
    }

    return err<never, LutProcessingError>({
      type: 'unsupported_source',
      key,
      lutId: lut.id,
      sourceType: lut.sourceType,
    });
  });
}

// =============================================================================
// Error Handling
// =============================================================================

async function handleLutProcessingError(env: Bindings, error: LutProcessingError): Promise<void> {
  const db = createDb(env.DATABASE_URL);

  switch (error.type) {
    case 'orphan':
      await bestEffortDeleteTemp(env, error.key);
      return;

    case 'expired':
      try {
        await db
          .update(photoLuts)
          .set({
            status: 'expired',
            errorCode: 'UPLOAD_EXPIRED',
            errorMessage: 'LUT upload expired before processing started',
          })
          .where(eq(photoLuts.id, error.lutId));
      } catch (e) {
        console.error('[lut-processing-consumer] Failed to mark expired:', e);
        Sentry.captureException(e);
        throw e;
      }
      await bestEffortDeleteTemp(env, error.key);
      return;

    case 'r2_not_found':
      try {
        await db
          .update(photoLuts)
          .set({
            status: 'failed',
            errorCode: 'R2_NOT_FOUND',
            errorMessage: 'Temporary upload object not found in R2',
          })
          .where(eq(photoLuts.id, error.lutId));
      } catch (e) {
        console.error('[lut-processing-consumer] Failed to mark not_found:', e);
        Sentry.captureException(e);
        throw e;
      }
      return;

    case 'invalid_lut':
      try {
        await db
          .update(photoLuts)
          .set({
            status: 'failed',
            errorCode: error.reason === 'unsupported' ? 'UNSUPPORTED_LUT' : 'INVALID_LUT_FORMAT',
            errorMessage: error.message,
          })
          .where(eq(photoLuts.id, error.lutId));
      } catch (e) {
        console.error('[lut-processing-consumer] Failed to mark invalid_lut:', e);
        Sentry.captureException(e);
        throw e;
      }
      await bestEffortDeleteTemp(env, error.key);
      return;

    case 'invalid_image':
      try {
        await db
          .update(photoLuts)
          .set({
            status: 'failed',
            errorCode: error.reason === 'decode_failed' ? 'IMAGE_DECODE_FAILED' : 'INVALID_IMAGE',
            errorMessage: error.message,
          })
          .where(eq(photoLuts.id, error.lutId));
      } catch (e) {
        console.error('[lut-processing-consumer] Failed to mark invalid_image:', e);
        Sentry.captureException(e);
        throw e;
      }
      await bestEffortDeleteTemp(env, error.key);
      return;

    case 'unsupported_source':
      try {
        await db
          .update(photoLuts)
          .set({
            status: 'failed',
            errorCode: 'UNSUPPORTED_SOURCE_TYPE',
            errorMessage: `Unsupported sourceType: ${error.sourceType}`,
          })
          .where(eq(photoLuts.id, error.lutId));
      } catch (e) {
        console.error('[lut-processing-consumer] Failed to mark unsupported_source:', e);
        Sentry.captureException(e);
        throw e;
      }
      await bestEffortDeleteTemp(env, error.key);
      return;

    case 'database':
    case 'r2':
      // Retryable errors (db/r2) - throw to let the queue retry.
      console.error(
        `[lut-processing-consumer] Retryable ${error.type} error (${error.operation}):`,
        error,
      );
      Sentry.captureException(error);
      throw new Error(`${error.type} error: ${error.operation}`);
  }
}

async function markRetryExhaustedFailure(params: {
  env: Bindings;
  uploadKey: string;
  error: Extract<LutProcessingError, { type: 'database' | 'r2' }>;
}): Promise<void> {
  const db = createDb(params.env.DATABASE_URL);

  const lut = await ResultAsync.fromPromise(
    db.query.photoLuts.findFirst({ where: eq(photoLuts.uploadR2Key, params.uploadKey) }),
    (cause) => cause,
  ).match(
    (row) => row,
    (e) => {
      console.error(
        '[lut-processing-consumer] Failed to fetch LUT for retry-exhausted failure:',
        e,
      );
      Sentry.captureException(e);
      return null;
    },
  );

  if (!lut) return;

  try {
    await db
      .update(photoLuts)
      .set({
        status: 'failed',
        errorCode: 'RETRY_EXHAUSTED',
        errorMessage: `${params.error.type} error (${params.error.operation}) exceeded retry limit`,
      })
      .where(eq(photoLuts.id, lut.id));
  } catch (e) {
    console.error('[lut-processing-consumer] Failed to mark retry-exhausted failure:', e);
    Sentry.captureException(e);
    return;
  }

  await bestEffortDeleteTemp(params.env, params.uploadKey);
}

// =============================================================================
// Queue Handler Export
// =============================================================================

export default {
  async queue(batch: MessageBatch<R2EventMessage>, env: Bindings): Promise<void> {
    if (batch.messages.length === 0) return;

    console.log(`[lut-processing-consumer] Processing batch of ${batch.messages.length} messages`);

    for (const message of batch.messages) {
      const result = await processLutUpload(env, message.body);

      if (result.isErr()) {
        const uploadKey = message.body.object.key;

        // If we keep retrying after a finite retry policy, we can permanently
        // strand LUT rows in `processing`. On the final attempt, record a
        // terminal failure for retryable errors.
        const MAX_RETRIES = 3;
        const MAX_ATTEMPTS = 1 + MAX_RETRIES;

        if (
          (result.error.type === 'database' || result.error.type === 'r2') &&
          message.attempts >= MAX_ATTEMPTS
        ) {
          await markRetryExhaustedFailure({
            env,
            uploadKey,
            error: result.error,
          });
          message.ack();
          continue;
        }

        try {
          await handleLutProcessingError(env, result.error);
          message.ack();
        } catch (e) {
          console.error('[lut-processing-consumer] Error handler threw (retrying):', e);
          Sentry.captureException(e);
          message.retry();
        }
      } else {
        message.ack();
      }
    }
  },
};
