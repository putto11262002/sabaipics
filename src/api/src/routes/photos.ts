import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, lt, inArray, sql, isNull } from 'drizzle-orm';
import { photos, activeEvents, photoStatuses } from '@/db';
import { requirePhotographer } from '../middleware';
import type { Bindings, Env } from '../types';
import { createZip } from 'littlezipper';
import { apiError, type HandlerError } from '../lib/error';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';

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
              pipelineApplied: photos.pipelineApplied,
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
          pipelineApplied: photo.pipelineApplied ?? null,
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
