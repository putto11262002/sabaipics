import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, lt, inArray, sql, asc, gt, isNull } from 'drizzle-orm';
import { photos, events, photoStatuses, creditLedger, photographers, Photo, type DatabaseTx } from '@sabaipics/db';
import { requirePhotographer, requireConsent, type PhotographerVariables } from '../middleware';
import type { Bindings } from '../types';
import type { PhotoJob } from '../types/photo-job';
import {
  normalizeImage,
  DEFAULT_NORMALIZE_OPTIONS,
  type NormalizeResult,
} from '../lib/images/normalize';
import { createZip } from 'littlezipper';
import { apiError, type HandlerError } from '../lib/error';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';

// =============================================================================
// Types
// =============================================================================

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables & {
    dbTx: () => DatabaseTx;
  };
};

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

// Photo upload validation
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
] as const;

const uploadPhotoSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, 'File cannot be empty')
    .refine(
      (file) => file.size <= MAX_FILE_SIZE,
      `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024} MB`,
    )
    .refine(
      (file) => ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number]),
      `File type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
    ),
  eventId: z.string().uuid('Invalid event ID format'),
});

// =============================================================================
// URL Generators
// =============================================================================

// Public transform URLs (cached at edge)
function generateThumbnailUrl(r2Key: string, cfDomain: string, r2BaseUrl: string): string {
  if (process.env.NODE_ENV === 'development') {
    return `${r2BaseUrl}/${r2Key}`;
  }
  return `${cfDomain}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${r2BaseUrl}/${r2Key}`;
}

function generatePreviewUrl(r2Key: string, cfDomain: string, r2BaseUrl: string): string {
  if (process.env.NODE_ENV === 'development') {
    return `${r2BaseUrl}/${r2Key}`;
  }
  return `${cfDomain}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${r2BaseUrl}/${r2Key}`;
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
            .select({ id: events.id })
            .from(events)
            .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
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
        const nextCursor = hasMore ? items[parsedLimit - 1].uploadedAt : null;

        // Generate URLs for each photo
        const data = items.map((photo) => ({
          id: photo.id,
          thumbnailUrl: generateThumbnailUrl(photo.r2Key, c.env.CF_ZONE, c.env.PHOTO_R2_BASE_URL),
          previewUrl: generatePreviewUrl(photo.r2Key, c.env.CF_ZONE, c.env.PHOTO_R2_BASE_URL),
          faceCount: photo.faceCount,
          fileSize: photo.fileSize,
          status: photo.status,
          uploadedAt: photo.uploadedAt,
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
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
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
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
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
  .post(
    '/photos',
    requirePhotographer(),
    requireConsent(),
    zValidator('form', uploadPhotoSchema),
    async (c) => {
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
              id: events.id,
              photographerId: events.photographerId,
              expiresAt: events.expiresAt,
            })
            .from(events)
            .where(eq(events.id, eventId))
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

        const normalizeResult = yield* ResultAsync.fromPromise(
          normalizeImage(
            arrayBuffer,
            originalMimeType,
            c.env.PHOTOS_BUCKET,
            c.env.PHOTO_R2_BASE_URL,
            DEFAULT_NORMALIZE_OPTIONS,
          ),
          (e): HandlerError => ({
            code: 'UNPROCESSABLE',
            message: 'Image processing failed',
            cause: e,
          }),
        );

        const { bytes: normalizedImageBytes, width, height } = normalizeResult;
        const fileSize = normalizedImageBytes.byteLength;

        // 5. Upload to R2 (before deducting credit)
        yield* ResultAsync.fromPromise(
          c.env.PHOTOS_BUCKET.put(r2Key, normalizedImageBytes, {
            httpMetadata: { contentType: 'image/jpeg' },
          }),
          (e): HandlerError => ({ code: 'BAD_GATEWAY', message: 'Storage upload failed', cause: e }),
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
                type: 'upload',
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
        .orTee((e) => e.cause && console.error(`[${c.req.url}] ${e.code}:`, e.cause))
        .match(
          (data) => c.json({ data }, 201),
          (e) => apiError(c, e),
        );
    },
  )
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
          photographerId: events.photographerId,
        })
        .from(photos)
        .innerJoin(events, eq(photos.eventId, events.id))
        .where(inArray(photos.id, ids));

      // Filter to only photos owned by this photographer
      const ownedPhotos = photoRows.filter((p) => p.photographerId === photographer.id);

      const data = ownedPhotos.map((photo) => ({
        id: photo.id,
        status: photo.status,
        errorName: photo.errorName,
        faceCount: photo.faceCount,
        fileSize: photo.fileSize,
        thumbnailUrl: generateThumbnailUrl(photo.r2Key, c.env.CF_ZONE, c.env.PHOTO_R2_BASE_URL),
        uploadedAt: photo.uploadedAt,
      }));

      return c.json({ data });
    },
  );
