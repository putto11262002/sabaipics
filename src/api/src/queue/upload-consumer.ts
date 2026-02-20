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

import * as Sentry from '@sentry/cloudflare';
import type { R2EventMessage } from '../types/r2-event';
import type { Bindings } from '../types';
import type { PhotoJob } from '../types/photo-job';
import { createDb, createDbTx } from '@/db';
import {
  activeEvents,
  events,
  photoLuts,
  uploadIntents,
  photos,
  creditLedger,
  photographers,
  type EventSettings,
} from '@/db';
import { eq, and, gt, asc, sql } from 'drizzle-orm';
import { ResultAsync, safeTry, ok, err, type Result } from 'neverthrow';
import {
  applyCubeLutToRgba,
  parseCubeLut,
  validateImageMagicBytes,
  extractJpegDimensions,
  extractPngDimensions,
  extractWebpDimensions,
} from '../lib/images';
import type { ParsedCubeLut } from '../lib/images/color-grade';
import { normalizeWithPhoton, type PhotonPostProcessHook } from '../lib/images/normalize';
import { extractExif } from '../lib/images/exif';
import { PHOTO_MAX_FILE_SIZE } from '../lib/upload/constants';

// Must match wrangler.api.jsonc consumer max_retries setting.
// CF Workers: attempts starts at 1, so last attempt = MAX_RETRIES + 1.
const MAX_RETRIES = 1;

// Max pixel count to prevent OOM during photon decode.
// 25 MP ≈ 5000×5000 ≈ ~100 MB pixel buffer (4 bytes/pixel).
const MAX_PIXELS = 25_000_000;

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

type ParsedLutCacheEntry =
  | { kind: 'ok'; lut: ParsedCubeLut }
  | { kind: 'skip'; reason: string; extra?: Record<string, unknown> };

type UploadBatchCaches = {
  eventSettingsByEventId: Map<string, EventSettings | null>;
  eventSettingsLoadFailedByEventId: Set<string>;
  parsedLutByPhotographerAndLutId: Map<string, ParsedLutCacheEntry>;
  lutLookupFailedByCacheKey: Set<string>;
  lutTextByR2Key: Map<string, string | null>;
};

const DEFAULT_COLOR_GRADE_SETTINGS = {
  enabled: false,
  lutId: null as string | null,
  intensity: 75,
  includeLuminance: false,
};

function resolveColorGradeSettings(settings: EventSettings | null): {
  enabled: boolean;
  lutId: string | null;
  intensity: number;
  includeLuminance: boolean;
} {
  const cg = settings?.colorGrade;
  const intensityRaw = cg?.intensity;
  const intensity =
    typeof intensityRaw === 'number' && Number.isFinite(intensityRaw)
      ? intensityRaw
      : DEFAULT_COLOR_GRADE_SETTINGS.intensity;

  return {
    enabled: cg?.enabled ?? DEFAULT_COLOR_GRADE_SETTINGS.enabled,
    lutId: cg?.lutId ?? DEFAULT_COLOR_GRADE_SETTINGS.lutId,
    intensity: Math.max(0, Math.min(100, Math.round(intensity))),
    includeLuminance: cg?.includeLuminance ?? DEFAULT_COLOR_GRADE_SETTINGS.includeLuminance,
  };
}

function unknownToString(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  try {
    return String(cause);
  } catch {
    return 'unknown';
  }
}

// =============================================================================
// Sentry Helpers
// =============================================================================

/** Capture a non-retryable upload error to Sentry */
function captureUploadError(
  errorType: string,
  context: {
    intentId?: string;
    photographerId?: string;
    eventId?: string;
    r2Key?: string;
    fileSize?: number | null;
    contentType?: string;
    extra?: Record<string, unknown>;
  },
): void {
  Sentry.withScope((scope) => {
    scope.setTag('error_type', errorType);
    scope.setTag('queue', 'upload-processing');
    if (context.intentId) scope.setTag('intent_id', context.intentId);
    if (context.photographerId) scope.setTag('photographer_id', context.photographerId);
    if (context.eventId) scope.setTag('event_id', context.eventId);
    if (context.r2Key) scope.setExtra('r2_key', context.r2Key);
    if (context.fileSize != null) scope.setExtra('file_size', context.fileSize);
    if (context.contentType) scope.setExtra('content_type', context.contentType);
    if (context.extra) {
      for (const [k, v] of Object.entries(context.extra)) {
        scope.setExtra(k, v);
      }
    }
    scope.setLevel('error');
    Sentry.captureMessage(`Upload failed: ${errorType}`);
  });
}

/** Capture a retryable upload error to Sentry (warning level) */
function captureUploadWarning(
  errorType: string,
  context: {
    intentId?: string;
    photographerId?: string;
    eventId?: string;
    r2Key?: string;
    extra?: Record<string, unknown>;
  },
): void {
  Sentry.withScope((scope) => {
    scope.setTag('error_type', errorType);
    scope.setTag('queue', 'upload-processing');
    if (context.intentId) scope.setTag('intent_id', context.intentId);
    if (context.photographerId) scope.setTag('photographer_id', context.photographerId);
    if (context.eventId) scope.setTag('event_id', context.eventId);
    if (context.r2Key) scope.setExtra('r2_key', context.r2Key);
    if (context.extra) {
      for (const [k, v] of Object.entries(context.extra)) {
        scope.setExtra(k, v);
      }
    }
    scope.setLevel('warning');
    Sentry.captureMessage(`Upload warning: ${errorType}`);
  });
}

// =============================================================================
// Processing
// =============================================================================

async function processUpload(
  env: Bindings,
  event: R2EventMessage,
  caches: UploadBatchCaches,
): Promise<Result<void, UploadProcessingError>> {
  return safeTry(async function* () {
    const { key, size } = event.object;
    const db = createDb(env.DATABASE_URL);

    console.log(`[upload-consumer] Processing: ${key}, size: ${size}`);

    // Step 1: Find matching upload intent
    const intent = yield* ResultAsync.fromPromise(
      Sentry.startSpan({ name: 'upload.find_intent', op: 'db.query' }, () =>
        db.query.uploadIntents.findFirst({ where: eq(uploadIntents.r2Key, key) }),
      ),
      (cause): UploadProcessingError => ({ type: 'database', operation: 'find_intent', cause }),
    );

    if (!intent) {
      captureUploadWarning('orphan', { r2Key: key });
      return err<never, UploadProcessingError>({ type: 'orphan', key });
    }

    // Intent context available from here — used in all Sentry captures below
    const intentCtx = {
      intentId: intent.id,
      photographerId: intent.photographerId,
      eventId: intent.eventId,
      r2Key: key,
      fileSize: intent.contentLength,
      contentType: intent.contentType,
    };

    // Step 2: Check if intent expired
    if (new Date(intent.expiresAt) < new Date(event.eventTime)) {
      captureUploadWarning('expired', intentCtx);
      return err<never, UploadProcessingError>({ type: 'expired', key, intentId: intent.id });
    }

    // Step 3: HEAD request first to check size without downloading
    const headResult = yield* ResultAsync.fromPromise(
      Sentry.startSpan({ name: 'upload.r2_fetch', op: 'r2.get' }, () =>
        env.PHOTOS_BUCKET.head(key),
      ),
      (cause): UploadProcessingError => ({ type: 'r2', operation: 'head', cause }),
    );

    if (!headResult) {
      captureUploadError('r2_object_not_found', intentCtx);
      return err<never, UploadProcessingError>({
        type: 'r2',
        operation: 'head',
        cause: 'Object not found',
      });
    }

    // Step 4: Validate file size from HEAD before downloading
    if (headResult.size > PHOTO_MAX_FILE_SIZE) {
      captureUploadError('invalid_file', {
        ...intentCtx,
        fileSize: headResult.size,
        extra: { reason: 'size_exceeded', max_size: PHOTO_MAX_FILE_SIZE },
      });
      return err<never, UploadProcessingError>({
        type: 'invalid_file',
        key,
        intentId: intent.id,
        reason: 'size_exceeded',
        message: 'File exceeds maximum size',
      });
    }

    // Step 5: Now safe to GET the full object
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

    const imageBytes = yield* ResultAsync.fromPromise(
      r2Object.arrayBuffer(),
      (cause): UploadProcessingError => ({ type: 'r2', operation: 'read_body', cause }),
    );

    // Step 6: Validate magic bytes
    const magicValidation = validateImageMagicBytes(new Uint8Array(imageBytes.slice(0, 16)));
    if (!magicValidation.valid) {
      captureUploadError('invalid_file', {
        ...intentCtx,
        extra: { reason: 'invalid_magic_bytes' },
      });
      return err<never, UploadProcessingError>({
        type: 'invalid_file',
        key,
        intentId: intent.id,
        reason: 'invalid_magic_bytes',
        message: 'File is not a valid image',
      });
    }

    // Step 6b: Dimension check — prevent OOM on decompression bombs
    const dims = (() => {
      switch (magicValidation.detectedType) {
        case 'image/jpeg':
          return extractJpegDimensions(imageBytes);
        case 'image/png':
          return extractPngDimensions(new Uint8Array(imageBytes));
        case 'image/webp':
          return extractWebpDimensions(new Uint8Array(imageBytes));
        default:
          return null;
      }
    })();

    if (dims && dims.width * dims.height > MAX_PIXELS) {
      captureUploadError('invalid_file', {
        ...intentCtx,
        extra: {
          reason: 'dimensions_too_large',
          width: dims.width,
          height: dims.height,
          pixels: dims.width * dims.height,
          maxPixels: MAX_PIXELS,
        },
      });
      return err<never, UploadProcessingError>({
        type: 'invalid_file',
        key,
        intentId: intent.id,
        reason: 'dimensions_too_large',
        message: `Image dimensions too large (${dims.width}×${dims.height} = ${dims.width * dims.height} pixels, max ${MAX_PIXELS})`,
      });
    }

    if (!dims) {
      captureUploadError('invalid_file', {
        ...intentCtx,
        extra: {
          reason: 'dimension_parse_failed',
          detectedType: magicValidation.detectedType,
        },
      });
      return err<never, UploadProcessingError>({
        type: 'invalid_file',
        key,
        intentId: intent.id,
        reason: 'dimension_parse_failed',
        message: 'Failed to extract image dimensions from header',
      });
    }

    // Step 6c: Extract EXIF metadata from original bytes (non-blocking)
    const exifResult = await extractExif(imageBytes);
    const exifData = exifResult.match(
      (data) => data,
      (error) => {
        captureUploadWarning('exif_extraction', {
          ...intentCtx,
          extra: {
            cause: error.cause instanceof Error ? error.cause.message : String(error.cause),
          },
        });
        return null;
      },
    );

    // Step 6c: Load event color grade settings + LUT (best-effort; never fail upload)
    let postProcess: PhotonPostProcessHook | undefined;
    let colorGradeApplied = false;
    let colorGradeSkip: { reason: string; extra?: Record<string, unknown> } | null = null;

    const hasEventSettings = caches.eventSettingsByEventId.has(intent.eventId);
    const eventSettings = hasEventSettings
      ? (caches.eventSettingsByEventId.get(intent.eventId) ?? null)
      : await ResultAsync.fromPromise(
          Sentry.startSpan({ name: 'upload.load_event_settings', op: 'db.query' }, async () => {
            const [row] = await db
              .select({ settings: activeEvents.settings })
              .from(activeEvents)
              .where(eq(activeEvents.id, intent.eventId))
              .limit(1);

            if (row) return row.settings ?? null;

            const [fallback] = await db
              .select({ settings: events.settings })
              .from(events)
              .where(eq(events.id, intent.eventId))
              .limit(1);
            return fallback?.settings ?? null;
          }),
          (cause) => cause,
        ).match(
          (settings) => {
            caches.eventSettingsByEventId.set(intent.eventId, settings);
            return settings;
          },
          (cause) => {
            colorGradeSkip = { reason: 'event_settings_unavailable' };
            // Do not cache failures: transient DB errors shouldn't disable grading
            // for the rest of the batch.
            if (!caches.eventSettingsLoadFailedByEventId.has(intent.eventId)) {
              caches.eventSettingsLoadFailedByEventId.add(intent.eventId);
              captureUploadWarning('color_grade_skipped', {
                ...intentCtx,
                extra: { reason: 'event_settings_unavailable', cause: unknownToString(cause) },
              });
            }
            return null;
          },
        );

    const colorGrade = resolveColorGradeSettings(eventSettings);
    if (colorGrade.enabled && colorGrade.lutId) {
      const lutId = colorGrade.lutId;
      const cacheKey = `${intent.photographerId}:${lutId}`;

      const warnSkip = (reason: string, extra?: Record<string, unknown>) => {
        colorGradeSkip = { reason, extra };
        captureUploadWarning('color_grade_skipped', {
          ...intentCtx,
          extra: { reason, lutId, ...(extra ?? {}) },
        });
      };

      const cached = caches.parsedLutByPhotographerAndLutId.get(cacheKey);
      if (cached) {
        if (cached.kind === 'ok') {
          postProcess = (pixels: Uint8Array) =>
            applyCubeLutToRgba(pixels, cached.lut, {
              intensity: colorGrade.intensity,
              includeLuminance: colorGrade.includeLuminance,
            });
          colorGradeApplied = true;
        } else {
          colorGradeSkip = { reason: cached.reason, extra: cached.extra };
        }
      } else {
        let lutLookupFailed = false;
        const lutRow = await ResultAsync.fromPromise(
          Sentry.startSpan({ name: 'upload.color_grade.find_lut', op: 'db.query' }, () =>
            db.query.photoLuts.findFirst({
              where: and(
                eq(photoLuts.id, lutId),
                eq(photoLuts.photographerId, intent.photographerId),
              ),
              columns: { status: true, lutR2Key: true },
            }),
          ),
          (cause) => cause,
        ).match(
          (row) => row,
          (cause) => {
            lutLookupFailed = true;
            // Do not cache failures: transient DB errors shouldn't disable grading
            // for the rest of the batch.
            if (!caches.lutLookupFailedByCacheKey.has(cacheKey)) {
              caches.lutLookupFailedByCacheKey.add(cacheKey);
              warnSkip('lut_lookup_failed', { cause: unknownToString(cause) });
            } else {
              colorGradeSkip = {
                reason: 'lut_lookup_failed',
                extra: { cause: unknownToString(cause) },
              };
            }
            return null;
          },
        );

        if (!lutRow) {
          if (lutLookupFailed) {
            // Already warned/cached.
          } else {
            caches.parsedLutByPhotographerAndLutId.set(cacheKey, {
              kind: 'skip',
              reason: 'lut_not_found',
            });
            warnSkip('lut_not_found');
          }
        } else if (lutRow.status !== 'completed' || !lutRow.lutR2Key) {
          caches.parsedLutByPhotographerAndLutId.set(cacheKey, {
            kind: 'skip',
            reason: 'lut_not_ready',
            extra: { status: lutRow.status, hasLutR2Key: Boolean(lutRow.lutR2Key) },
          });
          warnSkip('lut_not_ready', {
            status: lutRow.status,
            hasLutR2Key: Boolean(lutRow.lutR2Key),
          });
        } else {
          const lutR2Key = lutRow.lutR2Key;
          let lutText = caches.lutTextByR2Key.get(lutR2Key);

          if (lutText === undefined) {
            const r2Object = await ResultAsync.fromPromise(
              Sentry.startSpan({ name: 'upload.color_grade.r2_get_lut', op: 'r2.get' }, () =>
                env.PHOTOS_BUCKET.get(lutR2Key),
              ),
              (cause) => cause,
            ).match(
              (obj) => obj,
              (cause) => {
                caches.lutTextByR2Key.set(lutR2Key, null);
                warnSkip('lut_r2_get_failed', { cause: unknownToString(cause), lutR2Key });
                return null;
              },
            );

            if (!r2Object) {
              caches.lutTextByR2Key.set(lutR2Key, null);
              if (!colorGradeSkip) warnSkip('lut_r2_missing', { lutR2Key });
              lutText = null;
            } else {
              lutText = await ResultAsync.fromPromise(r2Object.text(), (cause) => cause).match(
                (text) => text,
                (cause) => {
                  warnSkip('lut_r2_read_failed', { cause: unknownToString(cause), lutR2Key });
                  return null;
                },
              );
              caches.lutTextByR2Key.set(lutR2Key, lutText);
            }
          }

          if (!lutText) {
            caches.parsedLutByPhotographerAndLutId.set(cacheKey, {
              kind: 'skip',
              reason: 'lut_text_unavailable',
              extra: { lutR2Key },
            });
            if (!colorGradeSkip) warnSkip('lut_text_unavailable', { lutR2Key });
          } else {
            const parsed = parseCubeLut(lutText);
            if (parsed.isErr()) {
              const extra = {
                message: parsed.error.message,
                line: parsed.error.line ?? null,
              };
              caches.parsedLutByPhotographerAndLutId.set(cacheKey, {
                kind: 'skip',
                reason: 'lut_parse_error',
                extra,
              });
              warnSkip('lut_parse_error', extra);
            } else {
              caches.parsedLutByPhotographerAndLutId.set(cacheKey, {
                kind: 'ok',
                lut: parsed.value,
              });
              postProcess = (pixels: Uint8Array) =>
                applyCubeLutToRgba(pixels, parsed.value, {
                  intensity: colorGrade.intensity,
                  includeLuminance: colorGrade.includeLuminance,
                });
              colorGradeApplied = true;
            }
          }
        }
      }
    }

    // Step 7: Normalize image to JPEG using photon (in-Worker Wasm)
    console.log(`[upload-consumer] Normalizing with photon_wasm: ${key}`);

    const normalizeResult = Sentry.startSpan(
      { name: 'upload.normalize', op: 'image.process' },
      (span) => {
        span.setAttribute('upload.original_size', imageBytes.byteLength);
        span.setAttribute('upload.color_grade.enabled', colorGrade.enabled);
        span.setAttribute('upload.color_grade.applied', colorGradeApplied);
        if (colorGrade.lutId) span.setAttribute('upload.color_grade.lut_id', colorGrade.lutId);
        if (colorGradeSkip) {
          span.setAttribute('upload.color_grade.skip_reason', colorGradeSkip.reason);
        }

        const result = normalizeWithPhoton(imageBytes, postProcess);
        if (result.isOk()) {
          span.setAttribute('upload.width', result.value.width);
          span.setAttribute('upload.height', result.value.height);
          span.setAttribute('upload.file_size', result.value.bytes.byteLength);
        } else {
          span.setAttribute('upload.error_stage', result.error.stage);
        }
        return result;
      },
    );

    if (normalizeResult.isErr()) {
      captureUploadWarning('normalization', {
        ...intentCtx,
        extra: {
          normalization_method: 'photon_wasm',
          stage: normalizeResult.error.stage,
          cause:
            normalizeResult.error.cause instanceof Error
              ? normalizeResult.error.cause.message
              : String(normalizeResult.error.cause),
          detectedType: magicValidation.detectedType,
          originalSize: imageBytes.byteLength,
        },
      });
      return err<never, UploadProcessingError>({
        type: 'normalization',
        key,
        intentId: intent.id,
        cause: normalizeResult.error.cause,
      });
    }

    const { bytes: normalizedBytes, width, height } = normalizeResult.value;
    const fileSize = normalizedBytes.byteLength;

    // Step 8: Generate final photo ID and key
    const photoId = crypto.randomUUID();
    const finalR2Key = `${intent.eventId}/${photoId}.jpg`;

    // Step 9: Upload normalized image to final location
    yield* ResultAsync.fromPromise(
      Sentry.startSpan({ name: 'upload.r2_put', op: 'r2.put' }, () =>
        env.PHOTOS_BUCKET.put(finalR2Key, normalizedBytes, {
          httpMetadata: { contentType: 'image/jpeg' },
        }),
      ),
      (cause): UploadProcessingError => ({ type: 'r2', operation: 'put_normalized', cause }),
    );

    // Step 10: Credit deduction + photo creation (transactional)
    const dbTx = createDbTx(env.DATABASE_URL);

    const photo = yield* ResultAsync.fromPromise(
      Sentry.startSpan({ name: 'upload.transaction', op: 'db.transaction' }, () =>
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
              exif: exifData,
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
      ),
      (cause): UploadProcessingError => {
        const msg = cause instanceof Error ? cause.message : '';
        if (msg === 'INSUFFICIENT_CREDITS') {
          captureUploadError('insufficient_credits', intentCtx);
          return { type: 'insufficient_credits', key, intentId: intent.id };
        }
        captureUploadError('database', {
          ...intentCtx,
          extra: { operation: 'transaction', cause: String(cause) },
        });
        return { type: 'database', operation: 'transaction', cause };
      },
    );

    // Step 11: Original R2 object left in place — cron handles cleanup

    // Step 12: Enqueue for face detection (best-effort)
    // The transaction already committed — credit deducted, photo created, intent completed.
    // If enqueue fails, we capture to Sentry but still return ok() to avoid:
    //   - re-running the entire pipeline (double credit deduction, duplicate photo)
    //   - overwriting the completed intent back to failed
    // The photo will be stuck in 'uploading' but a reconciliation cron can re-enqueue it.
    await ResultAsync.fromPromise(
      Sentry.startSpan({ name: 'upload.enqueue', op: 'queue.send' }, () =>
        env.PHOTO_QUEUE.send({
          photo_id: photo.id,
          event_id: intent.eventId,
          r2_key: photo.r2Key,
        } as PhotoJob),
      ),
      (cause) => cause,
    ).mapErr((enqueueCause) => {
      captureUploadError('enqueue_failed', {
        ...intentCtx,
        extra: {
          photoId: photo.id,
          finalR2Key: photo.r2Key,
          cause: unknownToString(enqueueCause),
        },
      });
    });

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

  const caches: UploadBatchCaches = {
    eventSettingsByEventId: new Map(),
    eventSettingsLoadFailedByEventId: new Set(),
    parsedLutByPhotographerAndLutId: new Map(),
    lutLookupFailedByCacheKey: new Set(),
    lutTextByR2Key: new Map(),
  };

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

    const result = await Sentry.startSpan(
      { name: 'upload.process', op: 'queue.process' },
      async (rootSpan) => {
        const r = await processUpload(env, event, caches);
        rootSpan.setAttribute('upload.r2_key', event.object.key);
        r.match(
          () => rootSpan.setAttribute('upload.status', 'ok'),
          (error) => {
            rootSpan.setAttribute('upload.status', 'error');
            rootSpan.setAttribute('upload.error_type', error.type);
          },
        );
        return r;
      },
    );
    const db = createDb(env.DATABASE_URL);

    await result.match(
      () => message.ack(),
      async (error) => {
        // Centralized cleanup using switch statement
        switch (error.type) {
          case 'orphan':
            // No intent to update — R2 object left for cron cleanup
            message.ack();
            break;

          case 'expired':
            await db
              .update(uploadIntents)
              .set({ status: 'expired', retryable: false })
              .where(eq(uploadIntents.id, error.intentId));
            message.ack();
            break;

          case 'invalid_file':
            await db
              .update(uploadIntents)
              .set({ status: 'failed', errorCode: error.reason, errorMessage: error.message, retryable: false })
              .where(eq(uploadIntents.id, error.intentId));
            message.ack();
            break;

          case 'insufficient_credits':
            // R2 preserved — user may top up credits and reprocess later
            await db
              .update(uploadIntents)
              .set({
                status: 'failed',
                errorCode: 'insufficient_credits',
                errorMessage: 'Insufficient credits',
                retryable: true,
              })
              .where(eq(uploadIntents.id, error.intentId));
            message.ack();
            break;

          case 'normalization': {
            const isLastAttempt = message.attempts > MAX_RETRIES;
            const capture = isLastAttempt ? captureUploadError : captureUploadWarning;
            capture('normalization', {
              intentId: error.intentId,
              r2Key: error.key,
              extra: {
                attempt: message.attempts,
                isLastAttempt,
                cause: unknownToString(error.cause),
              },
            });

            // Mark as failed so users see the error, but keep R2 object intact
            // and retry. If retry succeeds, the transaction overwrites to 'completed'.
            // If all retries exhaust, the intent is already 'failed' (not stuck 'pending').
            await db
              .update(uploadIntents)
              .set({
                status: 'failed',
                errorCode: 'normalization_failed',
                errorMessage: 'Image processing failed',
                retryable: false,
              })
              .where(eq(uploadIntents.id, error.intentId));
            message.retry();
            break;
          }

          case 'database':
          case 'r2': {
            const isLastAttempt = message.attempts > MAX_RETRIES;
            const errorCode = error.type === 'database' ? 'database_error' : 'r2_error';

            // Escalate to error on last attempt so Sentry alerts fire
            const capture = isLastAttempt ? captureUploadError : captureUploadWarning;
            capture(errorCode, {
              r2Key: event.object.key,
              extra: {
                attempt: message.attempts,
                isLastAttempt,
                operation: 'operation' in error ? error.operation : undefined,
                cause: 'cause' in error ? unknownToString(error.cause) : undefined,
              },
            });

            // Best-effort: find intent and mark as failed so it doesn't stay
            // stuck in 'pending' after retries exhaust. If DB itself is down,
            // this will fail silently — the DLQ is the last safety net.
            const failedIntent = await db.query.uploadIntents.findFirst({
              where: eq(uploadIntents.r2Key, event.object.key),
              columns: { id: true },
            }).catch(() => null);

            if (failedIntent) {
              await db
                .update(uploadIntents)
                .set({
                  status: 'failed',
                  errorCode,
                  errorMessage: `Upload processing failed: ${errorCode}`,
                  retryable: false,
                })
                .where(eq(uploadIntents.id, failedIntent.id))
                .catch(() => {});
            }

            message.retry();
            break;
          }
        }
      },
    );
  }
}
