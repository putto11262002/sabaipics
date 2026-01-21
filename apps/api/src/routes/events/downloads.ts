/**
 * Participant Photo Download Endpoints
 *
 * GET  /events/:eventId/photos/:photoId/download → 302 redirect to R2 URL
 * POST /events/:eventId/photos/download → Zip stream with { photoIds: string[] }
 *
 * Public endpoints for participants to download their matched photos.
 * No authentication required - protected by rate limiting per eventId.
 *
 * Implementation Plan: docs/logs/011_sab-17-participant-download/plan.md
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { photos } from '@sabaipics/db';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { createZip } from 'littlezipper';

// =============================================================================
// Zod Schemas
// =============================================================================

const eventParamsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
});

const photoParamsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
  photoId: z.string().uuid('Invalid photo ID format'),
});

const bulkDownloadSchema = z.object({
  photoIds: z
    .array(z.string().uuid('Invalid photo ID format'))
    .min(1, 'At least one photo ID required')
    .max(15, 'Maximum 15 photos per download'),
});

// =============================================================================
// URL Generators
// =============================================================================

/**
 * Generate a direct download URL for photos.
 * Photos are already normalized to high-quality JPEG during upload,
 * so no additional transformation is needed.
 */
function generateDownloadUrl(r2Key: string, r2BaseUrl: string): string {
  return `${r2BaseUrl}/${r2Key}`;
}

// =============================================================================
// Downloads Router
// =============================================================================

export const downloadsRouter = new Hono<Env>()
  // GET /events/:eventId/photos/:photoId/download - Single photo download (redirect)
  .get('/:eventId/photos/:photoId/download', zValidator('param', photoParamsSchema), async (c) => {
    const { eventId, photoId } = c.req.valid('param');

    return safeTry(async function* () {
      // Check rate limit
      const { success } = await c.env.DOWNLOAD_RATE_LIMITER.limit({ key: eventId });
      if (!success) {
        return err<never, HandlerError>({
          code: 'RATE_LIMITED',
          message: 'Too many download requests. Please try again later.',
          headers: { 'Retry-After': '60' },
        });
      }

      const db = c.var.db();

      // Query photo: eventId match, status='indexed', deletedAt is null
      const [photo] = yield* ResultAsync.fromPromise(
        db
          .select({
            id: photos.id,
            r2Key: photos.r2Key,
            status: photos.status,
          })
          .from(photos)
          .where(
            and(
              eq(photos.id, photoId),
              eq(photos.eventId, eventId),
              eq(photos.status, 'indexed'),
              isNull(photos.deletedAt),
            ),
          )
          .limit(1),
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Database error',
          cause: e,
        }),
      );

      if (!photo) {
        return err<never, HandlerError>({
          code: 'NOT_FOUND',
          message: 'Photo not found or not available for download',
        });
      }

      // Generate direct download URL (photos are already normalized during upload)
      const downloadUrl = generateDownloadUrl(photo.r2Key, c.env.PHOTO_R2_BASE_URL);

      return ok({ redirectUrl: downloadUrl });
    })
      .orTee((e) => e.cause && console.error(`[${c.req.url}] ${e.code}:`, e.cause))
      .match(
        (data) => c.redirect(data.redirectUrl, 302),
        (e) => apiError(c, e),
      );
  })

  // POST /events/:eventId/photos/download - Bulk download as zip
  .post(
    '/:eventId/photos/download',
    zValidator('param', eventParamsSchema),
    zValidator('json', bulkDownloadSchema),
    async (c) => {
      const { eventId } = c.req.valid('param');
      const { photoIds } = c.req.valid('json');

      return safeTry(async function* () {
        // Check rate limit
        const { success } = await c.env.DOWNLOAD_RATE_LIMITER.limit({ key: eventId });
        if (!success) {
          return err<never, HandlerError>({
            code: 'RATE_LIMITED',
            message: 'Too many download requests. Please try again later.',
            headers: { 'Retry-After': '60' },
          });
        }

        const db = c.var.db();

        // Query photos: eventId match, status='indexed', deletedAt is null
        const photoRows = yield* ResultAsync.fromPromise(
          db
            .select({
              id: photos.id,
              r2Key: photos.r2Key,
              uploadedAt: photos.uploadedAt,
            })
            .from(photos)
            .where(
              and(
                eq(photos.eventId, eventId),
                inArray(photos.id, photoIds),
                eq(photos.status, 'indexed'),
                isNull(photos.deletedAt),
              ),
            ),
          (e): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Database error',
            cause: e,
          }),
        );

        // Check if any photos were found
        if (photoRows.length === 0) {
          return err<never, HandlerError>({
            code: 'NOT_FOUND',
            message: 'No photos found or available for download',
          });
        }

        // Fetch all photos from R2 and prepare zip entries
        // Note: This loads all photos into memory. With max 15 photos (~3MB each),
        // worst case is ~45MB which is within CF Workers 128MB limit.
        const zipEntries = yield* ResultAsync.fromPromise(
          Promise.all(
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
          ),
          (e): HandlerError => ({
            code: 'BAD_GATEWAY',
            message: 'Failed to fetch photos from storage',
            cause: e,
          }),
        );

        // Create zip file
        const zipData = yield* ResultAsync.fromPromise(
          createZip(zipEntries),
          (e): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to create zip file',
            cause: e,
          }),
        );

        return ok({ zipData, photoCount: photoRows.length });
      })
        .orTee((e) => e.cause && console.error(`[${c.req.url}] ${e.code}:`, e.cause))
        .match(
          (data) => {
            const filename = `${eventId}-photos.zip`;

            // Convert to proper ArrayBuffer for Response
            const arrayBuffer = new ArrayBuffer(data.zipData.length);
            new Uint8Array(arrayBuffer).set(data.zipData);

            return new Response(arrayBuffer, {
              headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': data.zipData.length.toString(),
              },
            });
          },
          (e) => apiError(c, e),
        );
    },
  );
