import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, lt, inArray, sql, asc, gt, isNull } from 'drizzle-orm';
import { photos, activeEvents, photoStatuses, creditLedger, photographers } from '@sabaipics/db';
import { requirePhotographer } from '../middleware';
import type { Bindings, Env } from '../types';
import type { PhotoJob } from '../types/photo-job';
import { extractJpegDimensions } from '../lib/images/jpeg';
import { createZip } from 'littlezipper';
import { apiError, type HandlerError } from '../lib/error';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';

// =============================================================================
// Types
// =============================================================================

// =============================================================================
// Zod Schemas
// =============================================================================

const listPhotosParamsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
});

const listPhotosBodySchema = z.object({
  cursor: z.string().datetime('Invalid cursor format').optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50')
    .default(20),
  status: z.array(z.enum(photoStatuses)).optional(),
});

import { PHOTO_MAX_FILE_SIZE, PHOTO_ALLOWED_MIME_TYPES } from '../lib/upload/constants';

const uploadPhotoSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, 'File cannot be empty')
    .refine(
      (file) => file.size <= PHOTO_MAX_FILE_SIZE,
      `File size must be less than ${PHOTO_MAX_FILE_SIZE / 1024 / 1024} MB`,
    )
    .refine(
      (file) =>
        PHOTO_ALLOWED_MIME_TYPES.includes(file.type as (typeof PHOTO_ALLOWED_MIME_TYPES)[number]),
      `File type must be one of: ${PHOTO_ALLOWED_MIME_TYPES.join(', ')}`,
    ),
  eventId: z.string().uuid('Invalid event ID format'),
});

// =============================================================================
// URL Generators
// =============================================================================

// Public transform URLs (cached at edge)
function generateThumbnailUrl(env: Bindings, r2Key: string): string {
  if (env.NODE_ENV === 'development') {
    return `${env.PHOTO_R2_BASE_URL}/${r2Key}`;
  }
  return `https://${env.CF_ZONE}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${env.PHOTO_R2_BASE_URL}/${r2Key}`;
}

function generatePreviewUrl(env: Bindings, r2Key: string): string {
  if (env.NODE_ENV === 'development') {
    return `${env.PHOTO_R2_BASE_URL}/${r2Key}`;
  }
  return `https://${env.CF_ZONE}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${env.PHOTO_R2_BASE_URL}/${r2Key}`;
}

// =============================================================================
// Zod Schemas (route-specific)
// =============================================================================

const bulkDownloadSchema = z.object({
  photoIds: z
    .array(z.string().uuid('Invalid photo ID format'))
    .min(1)
    .max(15, 'Maximum 15 photos per download'),
});

const photosStatusQuerySchema = z.object({
  ids: z
    .string()
    .transform((val) => val.split(',').filter(Boolean))
    .pipe(z.array(z.string().uuid('Invalid photo ID format')).min(1).max(50)),
});

const bulkDeleteSchema = z.object({
  photoIds: z
    .array(z.string().uuid('Invalid photo ID format'))
    .min(1)
    .max(50, 'Maximum 50 photos per delete'),
});

// =============================================================================
// Routes
// =============================================================================

export const photosRouter = new Hono<Env>()
  // POST /events/:eventId/photos - List photos for an event
  .post(
    '/events/:eventId/photos',
    requirePhotographer(),
    zValidator('param', listPhotosParamsSchema),
    zValidator('json', listPhotosBodySchema),
    async (c) => {
      const { eventId } = c.req.valid('param');
      const { cursor, limit, status } = c.req.valid('json');

      const photographer = c.var.photographer;
      const db = c.var.db();

      // Use neverthrow pattern - wrap all async operations
      return await safeTry(async function* () {
        // CRITICAL: Verify event ownership BEFORE querying photos
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id })
            .from(activeEvents)
            .where(
              and(eq(activeEvents.id, eventId), eq(activeEvents.photographerId, photographer.id)),
            )
            .limit(1)
            .then((rows) => rows),
          (error): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to fetch event',
            cause: error,
          }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Cursor-based pagination: fetch limit + 1 to determine hasMore
        const parsedLimit = Math.min(limit, 50);
        const cursorLimit = parsedLimit + 1;

        const photoRows = yield* ResultAsync.fromPromise(
          db
            .select({
              id: photos.id,
              r2Key: photos.r2Key,
              status: photos.status,
              faceCount: photos.faceCount,
              fileSize: photos.fileSize,
              uploadedAt: photos.uploadedAt,
              width: photos.width,
              height: photos.height,
              exif: photos.exif,
            })
            .from(photos)
            .where(
              and(
                eq(photos.eventId, eventId),
                isNull(photos.deletedAt), // Exclude soft-deleted photos
                status ? inArray(photos.status, status) : undefined,
                cursor ? lt(photos.uploadedAt, cursor) : undefined,
              ),
            )
            .orderBy(desc(photos.uploadedAt))
            .limit(cursorLimit)
            .then((rows) => rows),
          (error): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to fetch photos',
            cause: error,
          }),
        );

        // Determine hasMore and trim extra row
        const hasMore = photoRows.length > parsedLimit;
        const items = hasMore ? photoRows.slice(0, parsedLimit) : photoRows;
        // Convert timestamp to ISO 8601 format for cursor
        const nextCursor = hasMore
          ? new Date(items[parsedLimit - 1].uploadedAt).toISOString()
          : null;

        // Generate URLs for each photo
        const data = items.map((photo) => ({
          id: photo.id,
          thumbnailUrl: generateThumbnailUrl(c.env, photo.r2Key),
          previewUrl: generatePreviewUrl(c.env, photo.r2Key),
          faceCount: photo.faceCount,
          fileSize: photo.fileSize,
          status: photo.status,
          uploadedAt: new Date(photo.uploadedAt).toISOString(),
          width: photo.width ?? 1,
          height: photo.height ?? 1,
          exif: photo.exif ?? null,
        }));

        return ok({
          data,
          pagination: {
            nextCursor,
            hasMore,
          },
        });
      })
        .orTee((e) => e.cause && console.error(`[${c.req.url}] ${e.code}:`, e.cause))
        .match(
          (result) => c.json(result),
          (e) => apiError(c, e),
        );
    },
  )
  // POST /events/:eventId/photos/download - Bulk download photos as zip
  .post(
    '/events/:eventId/photos/download',
    requirePhotographer(),
    zValidator('param', listPhotosParamsSchema),
    zValidator('json', bulkDownloadSchema),
    async (c) => {
      const { eventId } = c.req.valid('param');
      const { photoIds } = c.req.valid('json');
      const photographer = c.var.photographer;
      const db = c.var.db();

      // CRITICAL: Verify event ownership BEFORE fetching photos
      const [event] = await db
        .select({ id: activeEvents.id })
        .from(activeEvents)
        .where(and(eq(activeEvents.id, eventId), eq(activeEvents.photographerId, photographer.id)))
        .limit(1);

      if (!event) {
        return apiError(c, 'NOT_FOUND', 'Event not found');
      }

      // Fetch photos with ownership verification (exclude deleted)
      const photoRows = await db
        .select({
          id: photos.id,
          r2Key: photos.r2Key,
          uploadedAt: photos.uploadedAt,
        })
        .from(photos)
        .where(
          and(eq(photos.eventId, eventId), inArray(photos.id, photoIds), isNull(photos.deletedAt)),
        );

      // Verify all requested photos exist
      if (photoRows.length !== photoIds.length) {
        return apiError(c, 'NOT_FOUND', 'Some photos were not found');
      }

      // Fetch all photos from R2 and prepare zip entries
      const zipEntries = await Promise.all(
        photoRows.map(async (photo, index) => {
          const object = await c.env.PHOTOS_BUCKET.get(photo.r2Key);
          if (!object) {
            throw new Error(`Photo not found in R2: ${photo.r2Key}`);
          }

          const arrayBuffer = await object.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          return {
            path: `photo-${index + 1}.jpeg`,
            data: uint8Array,
            lastModified: new Date(photo.uploadedAt),
          };
        }),
      );

      // Create zip file
      const zipData = await createZip(zipEntries);
      const filename = `${eventId}-photos.zip`;

      // Convert to proper ArrayBuffer for Response
      const arrayBuffer = new ArrayBuffer(zipData.length);
      new Uint8Array(arrayBuffer).set(zipData);

      // Return zip file
      return new Response(arrayBuffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': zipData.length.toString(),
        },
      });
    },
  )
  // POST /events/:eventId/photos/delete - Bulk soft delete photos
  .post(
    '/events/:eventId/photos/delete',
    requirePhotographer(),
    zValidator('param', listPhotosParamsSchema),
    zValidator('json', bulkDeleteSchema),
    async (c) => {
      const { eventId } = c.req.valid('param');
      const { photoIds } = c.req.valid('json');
      const photographer = c.var.photographer;
      const db = c.var.db();

      // CRITICAL: Verify event ownership BEFORE deleting photos
      const [event] = await db
        .select({ id: activeEvents.id })
        .from(activeEvents)
        .where(and(eq(activeEvents.id, eventId), eq(activeEvents.photographerId, photographer.id)))
        .limit(1);

      if (!event) {
        return apiError(c, 'NOT_FOUND', 'Event not found');
      }

      // Soft delete photos (only non-deleted photos belonging to this event)
      const result = await db
        .update(photos)
        .set({ deletedAt: new Date().toISOString() })
        .where(
          and(eq(photos.eventId, eventId), inArray(photos.id, photoIds), isNull(photos.deletedAt)),
        )
        .returning({ id: photos.id });

      return c.json({
        data: {
          deletedCount: result.length,
          deletedIds: result.map((r) => r.id),
        },
      });
    },
  )
  // POST /photos - Upload a photo
  .post('/photos', requirePhotographer(), zValidator('form', uploadPhotoSchema), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { file, eventId } = c.req.valid('form');
      const originalMimeType = file.type;
      const originalFileSize = file.size;
      // 1. Verify event exists, is owned by photographer, and not expired
      const [event] = yield* ResultAsync.fromPromise(
        db
          .select({
            id: activeEvents.id,
            photographerId: activeEvents.photographerId,
            expiresAt: activeEvents.expiresAt,
          })
          .from(activeEvents)
          .where(eq(activeEvents.id, eventId))
          .limit(1),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
      );

      if (!event || event.photographerId !== photographer.id) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      if (new Date(event.expiresAt) < new Date()) {
        return err<never, HandlerError>({ code: 'GONE', message: 'This event has expired' });
      }

      // 2. Quick credit check (fail fast, no lock)
      const [balanceCheck] = yield* ResultAsync.fromPromise(
        db
          .select({ balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int` })
          .from(creditLedger)
          .where(
            and(
              eq(creditLedger.photographerId, photographer.id),
              gt(creditLedger.expiresAt, sql`NOW()`),
            ),
          ),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
      );

      if ((balanceCheck?.balance ?? 0) < 1) {
        return err<never, HandlerError>({
          code: 'PAYMENT_REQUIRED',
          message: 'Insufficient credits. Purchase more to continue.',
        });
      }

      // 3. Generate photo ID and r2Key upfront
      const photoId = crypto.randomUUID();
      const r2Key = `${eventId}/${photoId}.jpg`;

      // 4. Get file bytes and normalize image
      const arrayBuffer = await file.arrayBuffer();

      const normalizeResult = yield* ResultAsync.fromThrowable(
        async () => {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(arrayBuffer);
              controller.close();
            },
          });
          const res = await c.env.IMAGES.input(stream)
            .transform({
              width: 4000,
              fit: 'scale-down',
            })
            .output({ format: 'image/jpeg', quality: 90 })
            .then((res) => res.response())
            .then((res) => res.arrayBuffer());

          const dimensions = extractJpegDimensions(res);

          if (!dimensions) {
            throw new Error('Failed to extract dimensions from normalized JPEG');
          }

          return {
            bytes: res,
            width: dimensions.width,
            height: dimensions.height,
          };
        },
        (e): HandlerError => ({
          code: 'UNPROCESSABLE',
          message: 'Image processing failed',
          cause: e,
        }),
      )();

      const { bytes: normalizedImageBytes, width, height } = normalizeResult;
      const fileSize = normalizedImageBytes.byteLength;

      // 5. Upload to R2 (before deducting credit)
      yield* ResultAsync.fromPromise(
        c.env.PHOTOS_BUCKET.put(r2Key, normalizedImageBytes, {
          httpMetadata: { contentType: 'image/jpeg' },
        }),
        (e): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: 'Storage upload failed',
          cause: e,
        }),
      );

      // 6. Deduct credit + create photo record (atomic, only after R2 success)
      const photo = yield* ResultAsync.fromPromise(
        (async () => {
          const dbTx = c.var.dbTx();

          // Transaction: check balance, deduct credit, create photo record
          return await dbTx.transaction(async (tx) => {
            // Lock photographer row to prevent race conditions
            await tx
              .select({ id: photographers.id })
              .from(photographers)
              .where(eq(photographers.id, photographer.id))
              .for('update');

            // Re-check balance under lock
            const [balanceResult] = await tx
              .select({ balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int` })
              .from(creditLedger)
              .where(
                and(
                  eq(creditLedger.photographerId, photographer.id),
                  gt(creditLedger.expiresAt, sql`NOW()`),
                ),
              );

            if ((balanceResult?.balance ?? 0) < 1) {
              throw new Error('INSUFFICIENT_CREDITS');
            }

            // Find oldest unexpired purchase for FIFO expiry
            const [oldestCredit] = await tx
              .select({ expiresAt: creditLedger.expiresAt })
              .from(creditLedger)
              .where(
                and(
                  eq(creditLedger.photographerId, photographer.id),
                  gt(creditLedger.amount, 0),
                  gt(creditLedger.expiresAt, sql`NOW()`),
                ),
              )
              .orderBy(asc(creditLedger.expiresAt))
              .limit(1);

            if (!oldestCredit) {
              throw new Error('INSUFFICIENT_CREDITS');
            }

            // Deduct 1 credit with FIFO expiry
            await tx.insert(creditLedger).values({
              photographerId: photographer.id,
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
                eventId,
                r2Key,
                status: 'uploading',
                faceCount: 0,
                originalMimeType,
                originalFileSize,
                width,
                height,
                fileSize,
              })
              .returning();

            return newPhoto;
          });
        })(),
        (e): HandlerError => {
          const msg = e instanceof Error ? e.message : '';
          if (msg === 'INSUFFICIENT_CREDITS') {
            return {
              code: 'PAYMENT_REQUIRED',
              message: 'Insufficient credits. Purchase more to continue.',
            };
          }
          return { code: 'INTERNAL_ERROR', message: 'Database error', cause: e };
        },
      );

      // 7. Enqueue job for face detection
      yield* ResultAsync.fromPromise(
        c.env.PHOTO_QUEUE.send({
          photo_id: photo.id,
          event_id: eventId,
          r2_key: photo.r2Key,
        } as PhotoJob),
        (e): HandlerError => ({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Queue unavailable',
          cause: e,
        }),
      );

      // Return success data
      return ok({
        id: photo.id,
        eventId: photo.eventId,
        r2Key: photo.r2Key,
        status: photo.status,
        faceCount: photo.faceCount,
        fileSize,
        uploadedAt: photo.uploadedAt,
      });
    })
      .orTee((e) => console.log(e))
      .match(
        (data) => c.json({ data }, 201),
        (e) => apiError(c, e),
      );
  })
  // GET /photos/status - Batch photo status polling
  .get(
    '/photos/status',
    requirePhotographer(),
    zValidator('query', photosStatusQuerySchema),
    async (c) => {
      const { ids } = c.req.valid('query');
      const photographer = c.var.photographer;
      const db = c.var.db();

      // Get photos with ownership verification via event
      const photoRows = await db
        .select({
          id: photos.id,
          r2Key: photos.r2Key,
          status: photos.status,
          errorName: photos.errorName,
          faceCount: photos.faceCount,
          fileSize: photos.fileSize,
          uploadedAt: photos.uploadedAt,
          eventId: photos.eventId,
          photographerId: activeEvents.photographerId,
        })
        .from(photos)
        .innerJoin(activeEvents, eq(photos.eventId, activeEvents.id))
        .where(inArray(photos.id, ids));

      // Filter to only photos owned by this photographer
      const ownedPhotos = photoRows.filter((p) => p.photographerId === photographer.id);

      const data = ownedPhotos.map((photo) => ({
        id: photo.id,
        status: photo.status,
        errorName: photo.errorName,
        faceCount: photo.faceCount,
        fileSize: photo.fileSize,
        thumbnailUrl: generateThumbnailUrl(c.env, photo.r2Key),
        uploadedAt: photo.uploadedAt,
      }));

      return c.json({ data });
    },
  );
