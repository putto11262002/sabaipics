/**
 * Upload Processing Queue Consumer
 *
 * Handles R2 event notifications for presigned URL uploads:
 * 1. Match R2 object to upload_intent
 * 2. Validate file (magic bytes, size)
 * 3. Normalize image (convert to JPEG)
 * 4. Deduct credit
 * 5. Create photo record
 * 6. Enqueue for face detection
 */

import type { R2EventMessage } from '../types/r2-event';
import type { Bindings } from '../types';
import type { PhotoJob } from '../types/photo-job';
import { createDb, createDbTx } from '@sabaipics/db';
import { uploadIntents, photos, creditLedger, photographers } from '@sabaipics/db';
import { eq, and, gt, asc, sql } from 'drizzle-orm';
import { ResultAsync, safeTry, ok, err, type Result } from 'neverthrow';
import { extractJpegDimensions, validateImageMagicBytes } from '../lib/images';

// =============================================================================
// Types
// =============================================================================

type UploadProcessingError =
  | { type: 'orphan'; key: string } // No matching intent
  | { type: 'expired'; key: string; intentId: string } // Intent expired
  | { type: 'invalid_file'; key: string; intentId: string; reason: string; message: string } // Failed validation
  | { type: 'database'; operation: string; cause: unknown }
  | { type: 'normalization'; key: string; intentId: string; cause: unknown }
  | { type: 'r2'; operation: string; cause: unknown }
  | { type: 'insufficient_credits'; key: string; intentId: string };

// =============================================================================
// Constants
// =============================================================================

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// =============================================================================
// Processing
// =============================================================================

async function processUpload(
  env: Bindings,
  event: R2EventMessage,
): Promise<Result<void, UploadProcessingError>> {
  return safeTry(async function* () {
    const { key, size } = event.object;
    const db = createDb(env.DATABASE_URL);

    console.log(`[upload-consumer] Processing: ${key}, size: ${size}`);

    // Step 1: Find matching upload intent
    const intent = yield* ResultAsync.fromPromise(
      db.query.uploadIntents.findFirst({ where: eq(uploadIntents.r2Key, key) }),
      (cause): UploadProcessingError => ({ type: 'database', operation: 'find_intent', cause }),
    );

    if (!intent) {
      // Orphan upload - cleanup handled by queue handler
      console.warn(`[upload-consumer] Orphan upload: ${key}`);
      return err<never, UploadProcessingError>({ type: 'orphan', key });
    }

    // Step 2: Check if intent expired
    if (new Date(intent.expiresAt) < new Date(event.eventTime)) {
      // Cleanup handled by queue handler
      console.warn(`[upload-consumer] Expired intent: ${intent.id}`);
      return err<never, UploadProcessingError>({ type: 'expired', key, intentId: intent.id });
    }

    // Step 3: Update intent status to 'uploaded'
    yield* ResultAsync.fromPromise(
      db
        .update(uploadIntents)
        .set({ status: 'uploaded', uploadedAt: event.eventTime })
        .where(eq(uploadIntents.id, intent.id)),
      (cause): UploadProcessingError => ({ type: 'database', operation: 'update_status', cause }),
    );

    // Step 4: HEAD request first to check size without downloading
    const headResult = yield* ResultAsync.fromPromise(
      env.PHOTOS_BUCKET.head(key),
      (cause): UploadProcessingError => ({ type: 'r2', operation: 'head', cause }),
    );

    if (!headResult) {
      console.warn(`[upload-consumer] Object not found: ${key}`);
      return err<never, UploadProcessingError>({
        type: 'r2',
        operation: 'head',
        cause: 'Object not found',
      });
    }

    // Step 5: Validate file size from HEAD before downloading
    if (headResult.size > MAX_FILE_SIZE) {
      // Cleanup handled by queue handler
      return err<never, UploadProcessingError>({
        type: 'invalid_file',
        key,
        intentId: intent.id,
        reason: 'size_exceeded',
        message: 'File exceeds maximum size',
      });
    }

    // Step 6: Now safe to GET the full object
    const r2Object = yield* ResultAsync.fromPromise(
      env.PHOTOS_BUCKET.get(key),
      (cause): UploadProcessingError => ({ type: 'r2', operation: 'get', cause }),
    ).andThen((obj) =>
      obj
        ? ok(obj)
        : err<R2ObjectBody, UploadProcessingError>({
            type: 'r2',
            operation: 'get',
            cause: 'Object not found',
          }),
    );

    const imageBytes = await r2Object.arrayBuffer();

    // Step 7: Validate magic bytes
    const magicValidation = validateImageMagicBytes(new Uint8Array(imageBytes.slice(0, 16)));
    if (!magicValidation.valid) {
      // Cleanup handled by queue handler
      return err<never, UploadProcessingError>({
        type: 'invalid_file',
        key,
        intentId: intent.id,
        reason: 'invalid_magic_bytes',
        message: 'File is not a valid image',
      });
    }

    // Step 8: Normalize image to JPEG using CF Images binding directly
    // Convert ArrayBuffer to ReadableStream for CF Images API
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(imageBytes));
        controller.close();
      },
    });

    // Transform using CF Images API (same options as V1 upload)
    const transformResponse = yield* ResultAsync.fromPromise(
      env.IMAGES.input(stream)
        .transform({ width: 4000, fit: 'scale-down' })
        .output({ format: 'image/jpeg', quality: 90 }),
      (cause): UploadProcessingError => ({
        type: 'normalization',
        key,
        intentId: intent.id,
        cause,
      }),
    );

    const normalizedBytes = yield* ResultAsync.fromPromise(
      transformResponse.response().arrayBuffer(),
      (cause): UploadProcessingError => ({
        type: 'normalization',
        key,
        intentId: intent.id,
        cause,
      }),
    );

    // Extract dimensions from normalized JPEG
    const dimensions = extractJpegDimensions(normalizedBytes);
    if (!dimensions) {
      // Cleanup handled by queue handler
      return err<never, UploadProcessingError>({
        type: 'normalization',
        key,
        intentId: intent.id,
        cause: 'Failed to extract dimensions from normalized JPEG',
      });
    }

    const { width, height } = dimensions;
    const fileSize = normalizedBytes.byteLength;

    // Step 9: Generate final photo ID and key
    const photoId = crypto.randomUUID();
    const finalR2Key = `${intent.eventId}/${photoId}.jpg`;

    // Step 10: Upload normalized image to final location
    yield* ResultAsync.fromPromise(
      env.PHOTOS_BUCKET.put(finalR2Key, normalizedBytes, {
        httpMetadata: { contentType: 'image/jpeg' },
      }),
      (cause): UploadProcessingError => ({ type: 'r2', operation: 'put_normalized', cause }),
    );

    // Step 11: Credit deduction + photo creation (transactional)
    const dbTx = createDbTx(env.DATABASE_URL);

    const photo = yield* ResultAsync.fromPromise(
      dbTx.transaction(async (tx) => {
        // Lock photographer row
        await tx
          .select({ id: photographers.id })
          .from(photographers)
          .where(eq(photographers.id, intent.photographerId))
          .for('update');

        // Check balance under lock
        const [balanceResult] = await tx
          .select({ balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int` })
          .from(creditLedger)
          .where(
            and(
              eq(creditLedger.photographerId, intent.photographerId),
              gt(creditLedger.expiresAt, sql`NOW()`),
            ),
          );

        if ((balanceResult?.balance ?? 0) < 1) {
          throw new Error('INSUFFICIENT_CREDITS');
        }

        // Find oldest unexpired credit (FIFO)
        const [oldestCredit] = await tx
          .select({ expiresAt: creditLedger.expiresAt })
          .from(creditLedger)
          .where(
            and(
              eq(creditLedger.photographerId, intent.photographerId),
              gt(creditLedger.amount, 0),
              gt(creditLedger.expiresAt, sql`NOW()`),
            ),
          )
          .orderBy(asc(creditLedger.expiresAt))
          .limit(1);

        if (!oldestCredit) {
          throw new Error('INSUFFICIENT_CREDITS');
        }

        // Deduct 1 credit
        await tx.insert(creditLedger).values({
          photographerId: intent.photographerId,
          amount: -1,
          type: 'debit',
          source: 'upload',
          expiresAt: oldestCredit.expiresAt,
          stripeSessionId: null,
        });

        // Create photo record
        const [newPhoto] = await tx
          .insert(photos)
          .values({
            id: photoId,
            eventId: intent.eventId,
            r2Key: finalR2Key,
            status: 'uploading',
            faceCount: 0,
            originalMimeType: intent.contentType,
            originalFileSize: intent.contentLength,
            width,
            height,
            fileSize,
          })
          .returning();

        // Update intent to completed with photoId mapping
        await tx
          .update(uploadIntents)
          .set({
            status: 'completed',
            completedAt: new Date().toISOString(),
            photoId: newPhoto.id,
          })
          .where(eq(uploadIntents.id, intent.id));

        return newPhoto;
      }),
      (cause): UploadProcessingError => {
        const msg = cause instanceof Error ? cause.message : '';
        if (msg === 'INSUFFICIENT_CREDITS') {
          return { type: 'insufficient_credits', key, intentId: intent.id };
        }
        return { type: 'database', operation: 'transaction', cause };
      },
    );

    // Step 12: Delete original upload (keep only normalized)
    await env.PHOTOS_BUCKET.delete(key);

    // Step 13: Enqueue for face detection
    yield* ResultAsync.fromPromise(
      env.PHOTO_QUEUE.send({
        photo_id: photo.id,
        event_id: intent.eventId,
        r2_key: photo.r2Key,
      } as PhotoJob),
      (cause): UploadProcessingError => ({ type: 'r2', operation: 'enqueue', cause }),
    );

    console.log(`[upload-consumer] Completed: ${photo.id}`);
    return ok(undefined);
  });
}

// =============================================================================
// Queue Handler
// =============================================================================

export async function queue(
  batch: MessageBatch<R2EventMessage>,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  if (batch.messages.length === 0) return;

  for (const message of batch.messages) {
    const event = message.body;

    // Only process PutObject events
    if (event.action !== 'PutObject' && event.action !== 'CompleteMultipartUpload') {
      message.ack();
      continue;
    }

    // Only process uploads/ prefix
    if (!event.object.key.startsWith('uploads/')) {
      message.ack();
      continue;
    }

    const result = await processUpload(env, event);
    const db = createDb(env.DATABASE_URL);

    result.match(
      () => message.ack(),
      async (error) => {
        // Centralized cleanup using switch statement
        switch (error.type) {
          case 'orphan':
            await env.PHOTOS_BUCKET.delete(error.key);
            message.ack();
            break;

          case 'expired':
            await env.PHOTOS_BUCKET.delete(error.key);
            await db
              .update(uploadIntents)
              .set({ status: 'expired' })
              .where(eq(uploadIntents.id, error.intentId));
            message.ack();
            break;

          case 'invalid_file':
            await env.PHOTOS_BUCKET.delete(error.key);
            await db
              .update(uploadIntents)
              .set({ status: 'failed', errorCode: error.reason, errorMessage: error.message })
              .where(eq(uploadIntents.id, error.intentId));
            message.ack();
            break;

          case 'insufficient_credits':
            // Don't delete R2 - user may top up credits and retry later
            await db
              .update(uploadIntents)
              .set({
                status: 'failed',
                errorCode: 'insufficient_credits',
                errorMessage: 'Insufficient credits',
              })
              .where(eq(uploadIntents.id, error.intentId));
            message.ack();
            break;

          case 'normalization':
            await env.PHOTOS_BUCKET.delete(error.key);
            await db
              .update(uploadIntents)
              .set({
                status: 'failed',
                errorCode: 'normalization_failed',
                errorMessage: 'Image processing failed',
              })
              .where(eq(uploadIntents.id, error.intentId));
            message.retry();
            break;

          case 'database':
          case 'r2':
            // Retryable - don't cleanup, just retry
            console.error(`[upload-consumer] Retryable error:`, error);
            message.retry();
            break;
        }
      },
    );
  }
}
