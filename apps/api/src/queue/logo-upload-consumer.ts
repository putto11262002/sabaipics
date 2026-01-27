/**
 * Logo Upload Processing Queue Consumer
 *
 * Handles R2 event notifications for logo uploads via presigned URLs:
 * 1. Match R2 object to upload_intent
 * 2. Validate file (magic bytes, size)
 * 3. Normalize image (resize, convert to JPEG)
 * 4. Update event.logo_r2_key
 * 5. Cleanup temporary upload
 */

import type { R2EventMessage } from '../types/r2-event';
import type { Bindings } from '../types';
import { createDb } from '@sabaipics/db';
import { logoUploadIntents, events } from '@sabaipics/db';
import { eq } from 'drizzle-orm';
import { ResultAsync, safeTry, ok, err, type Result } from 'neverthrow';
import { extractJpegDimensions, validateImageMagicBytes } from '../lib/images';
import {
  LOGO_MAX_FILE_SIZE,
  LOGO_MAX_DIMENSION,
  LOGO_OUTPUT_QUALITY,
} from '../routes/events/logo-schema';

// =============================================================================
// Types
// =============================================================================

type LogoProcessingError =
  | { type: 'orphan'; key: string } // No matching intent
  | { type: 'expired'; key: string; intentId: string } // Intent expired
  | { type: 'invalid_file'; key: string; intentId: string; reason: string; message: string } // Failed validation
  | { type: 'database'; operation: string; cause: unknown }
  | { type: 'normalization'; key: string; intentId: string; cause: unknown }
  | { type: 'r2'; operation: string; cause: unknown };

// =============================================================================
// Processing
// =============================================================================

async function processLogoUpload(
  env: Bindings,
  event: R2EventMessage,
): Promise<Result<void, LogoProcessingError>> {
  return safeTry(async function* () {
    const { key, size } = event.object;
    const db = createDb(env.DATABASE_URL);

    console.log(`[logo-upload-consumer] Processing: ${key}, size: ${size}`);

    // Step 1: Find matching upload intent
    const intent = yield* ResultAsync.fromPromise(
      db.query.logoUploadIntents.findFirst({ where: eq(logoUploadIntents.r2Key, key) }),
      (cause): LogoProcessingError => ({ type: 'database', operation: 'find_intent', cause }),
    );

    if (!intent) {
      console.warn(`[logo-upload-consumer] Orphan upload: ${key}`);
      return err<never, LogoProcessingError>({ type: 'orphan', key });
    }

    // Step 2: Check if intent expired
    if (new Date(intent.expiresAt) < new Date(event.eventTime)) {
      console.warn(`[logo-upload-consumer] Expired intent: ${intent.id}`);
      return err<never, LogoProcessingError>({ type: 'expired', key, intentId: intent.id });
    }

    // Step 3: Update intent status to 'uploaded'
    yield* ResultAsync.fromPromise(
      db
        .update(logoUploadIntents)
        .set({ status: 'uploaded', uploadedAt: event.eventTime })
        .where(eq(logoUploadIntents.id, intent.id)),
      (cause): LogoProcessingError => ({ type: 'database', operation: 'update_status', cause }),
    );

    // Step 4: HEAD request to check size without downloading
    const headResult = yield* ResultAsync.fromPromise(
      env.PHOTOS_BUCKET.head(key),
      (cause): LogoProcessingError => ({ type: 'r2', operation: 'head', cause }),
    );

    if (!headResult) {
      console.warn(`[logo-upload-consumer] Object not found: ${key}`);
      return err<never, LogoProcessingError>({
        type: 'r2',
        operation: 'head',
        cause: 'Object not found',
      });
    }

    // Step 5: Validate file size from HEAD
    if (headResult.size > LOGO_MAX_FILE_SIZE) {
      console.warn(
        `[logo-upload-consumer] File too large: ${headResult.size} > ${LOGO_MAX_FILE_SIZE}`,
      );
      return err<never, LogoProcessingError>({
        type: 'invalid_file',
        key,
        intentId: intent.id,
        reason: 'size_exceeded',
        message: `File size ${headResult.size} exceeds maximum ${LOGO_MAX_FILE_SIZE}`,
      });
    }

    // Step 6: Download file from R2
    const r2Object = yield* ResultAsync.fromPromise(
      env.PHOTOS_BUCKET.get(key),
      (cause): LogoProcessingError => ({ type: 'r2', operation: 'get', cause }),
    );

    if (!r2Object) {
      return err<never, LogoProcessingError>({
        type: 'r2',
        operation: 'get',
        cause: 'Object not found',
      });
    }

    const imageBytes = new Uint8Array(
      yield* ResultAsync.fromPromise(
        r2Object.arrayBuffer(),
        (cause): LogoProcessingError => ({ type: 'r2', operation: 'read', cause }),
      ),
    );

    // Step 7: Validate magic bytes
    const magicValidation = validateImageMagicBytes(imageBytes);
    if (!magicValidation.valid) {
      console.warn(`[logo-upload-consumer] Invalid magic bytes for ${key}`);
      return err<never, LogoProcessingError>({
        type: 'invalid_file',
        key,
        intentId: intent.id,
        reason: 'invalid_magic_bytes',
        message: `Invalid image format. Expected image file, got unknown format.`,
      });
    }

    console.log(`[logo-upload-consumer] Detected format: ${magicValidation.detectedType}`);

    // Step 8: Normalize image (resize to max 2048px, convert to JPEG quality 95)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(imageBytes);
        controller.close();
      },
    });

    const transformResponse = yield* ResultAsync.fromPromise(
      env.IMAGES.input(stream)
        .transform({ width: LOGO_MAX_DIMENSION, fit: 'scale-down' })
        .output({ format: 'image/jpeg', quality: LOGO_OUTPUT_QUALITY }),
      (cause): LogoProcessingError => ({
        type: 'normalization',
        key,
        intentId: intent.id,
        cause,
      }),
    );

    const normalizedBytes = new Uint8Array(
      yield* ResultAsync.fromPromise(
        transformResponse.response().arrayBuffer(),
        (cause): LogoProcessingError => ({
          type: 'normalization',
          key,
          intentId: intent.id,
          cause,
        }),
      ),
    );

    // Step 9: Extract dimensions from normalized JPEG
    const dimensions = extractJpegDimensions(normalizedBytes.buffer);
    if (!dimensions) {
      console.warn(`[logo-upload-consumer] Failed to extract dimensions from ${key}`);
    }

    // Step 10: Generate final R2 key
    const logoId = crypto.randomUUID();
    const finalR2Key = `${intent.eventId}/logo/${logoId}.jpg`;

    // Step 11: Upload normalized logo to final location
    yield* ResultAsync.fromPromise(
      env.PHOTOS_BUCKET.put(finalR2Key, normalizedBytes, {
        httpMetadata: { contentType: 'image/jpeg' },
      }),
      (cause): LogoProcessingError => ({ type: 'r2', operation: 'put_final', cause }),
    );

    console.log(`[logo-upload-consumer] Uploaded normalized logo to ${finalR2Key}`);

    // Step 11.5: Delete old logo if exists
    const [existingEvent] = yield* ResultAsync.fromPromise(
      db
        .select({ logoR2Key: events.logoR2Key })
        .from(events)
        .where(eq(events.id, intent.eventId))
        .limit(1),
      (cause): LogoProcessingError => ({ type: 'database', operation: 'fetch_old_logo', cause }),
    );

    if (existingEvent?.logoR2Key) {
      console.log(`[logo-upload-consumer] Deleting old logo: ${existingEvent.logoR2Key}`);
      yield* ResultAsync.fromPromise(
        env.PHOTOS_BUCKET.delete(existingEvent.logoR2Key),
        (cause): LogoProcessingError => ({ type: 'r2', operation: 'delete_old_logo', cause }),
      );
    }

    // Step 12: Update event.logo_r2_key
    yield* ResultAsync.fromPromise(
      db.update(events).set({ logoR2Key: finalR2Key }).where(eq(events.id, intent.eventId)),
      (cause): LogoProcessingError => ({ type: 'database', operation: 'update_event', cause }),
    );

    // Step 13: Update intent status to 'completed'
    yield* ResultAsync.fromPromise(
      db
        .update(logoUploadIntents)
        .set({ status: 'completed', completedAt: new Date().toISOString() })
        .where(eq(logoUploadIntents.id, intent.id)),
      (cause): LogoProcessingError => ({ type: 'database', operation: 'mark_completed', cause }),
    );

    // Step 14: Delete temporary upload
    yield* ResultAsync.fromPromise(
      env.PHOTOS_BUCKET.delete(key),
      (cause): LogoProcessingError => ({ type: 'r2', operation: 'delete_temp', cause }),
    );

    console.log(`[logo-upload-consumer] Successfully processed logo upload: ${intent.id}`);
    return ok(undefined);
  });
}

// =============================================================================
// Error Handling
// =============================================================================

async function handleLogoProcessingError(env: Bindings, error: LogoProcessingError): Promise<void> {
  const db = createDb(env.DATABASE_URL);

  switch (error.type) {
    case 'orphan':
      // Delete orphan R2 object
      console.log(`[logo-upload-consumer] Deleting orphan: ${error.key}`);
      try {
        await env.PHOTOS_BUCKET.delete(error.key);
      } catch (e) {
        console.error(`[logo-upload-consumer] Failed to delete orphan ${error.key}:`, e);
      }
      break;

    case 'expired':
      // Mark intent as expired and delete R2 object
      console.log(`[logo-upload-consumer] Marking expired: ${error.intentId}`);
      try {
        await db
          .update(logoUploadIntents)
          .set({
            status: 'expired',
            errorCode: 'UPLOAD_EXPIRED',
            errorMessage: 'Upload intent expired before file was uploaded',
          })
          .where(eq(logoUploadIntents.id, error.intentId));
        await env.PHOTOS_BUCKET.delete(error.key);
      } catch (e) {
        console.error(`[logo-upload-consumer] Failed to handle expired ${error.intentId}:`, e);
      }
      break;

    case 'invalid_file':
      // Mark intent as failed and delete R2 object
      console.log(
        `[logo-upload-consumer] Marking invalid: ${error.intentId}, reason: ${error.reason}`,
      );
      try {
        await db
          .update(logoUploadIntents)
          .set({
            status: 'failed',
            errorCode: error.reason.toUpperCase(),
            errorMessage: error.message,
          })
          .where(eq(logoUploadIntents.id, error.intentId));
        await env.PHOTOS_BUCKET.delete(error.key);
      } catch (e) {
        console.error(`[logo-upload-consumer] Failed to handle invalid ${error.intentId}:`, e);
      }
      break;

    case 'normalization':
      // Mark intent as failed, keep R2 object for retry
      console.log(`[logo-upload-consumer] Normalization failed: ${error.intentId}`);
      try {
        await db
          .update(logoUploadIntents)
          .set({
            status: 'failed',
            errorCode: 'NORMALIZATION_FAILED',
            errorMessage: 'Failed to process logo image',
          })
          .where(eq(logoUploadIntents.id, error.intentId));
      } catch (e) {
        console.error(
          `[logo-upload-consumer] Failed to mark normalization error ${error.intentId}:`,
          e,
        );
      }
      break;

    case 'database':
    case 'r2':
      // Retryable errors - log and let queue retry
      console.error(
        `[logo-upload-consumer] ${error.type} error (${error.operation}):`,
        error.cause,
      );
      throw new Error(`${error.type} error: ${error.operation}`);

    default:
      console.error('[logo-upload-consumer] Unknown error type:', error);
  }
}

// =============================================================================
// Queue Handler Export
// =============================================================================

export default {
  async queue(batch: MessageBatch<R2EventMessage>, env: Bindings): Promise<void> {
    console.log(`[logo-upload-consumer] Processing batch of ${batch.messages.length} messages`);

    for (const message of batch.messages) {
      const result = await processLogoUpload(env, message.body);

      if (result.isErr()) {
        try {
          await handleLogoProcessingError(env, result.error);
          message.ack();
        } catch (error) {
          console.error('[logo-upload-consumer] Error handler failed:', error);
          message.retry();
        }
      } else {
        message.ack();
      }
    }
  },
};
