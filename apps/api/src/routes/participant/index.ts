/**
 * Participant Routes
 *
 * Public endpoints for event participants (no authentication required).
 * All routes are protected by rate limiting per eventId.
 *
 * Routes:
 * - GET  /participant/events/:eventId                          - Public event info
 * - GET  /participant/events/:eventId/slideshow                - Slideshow info + config + stats
 * - GET  /participant/events/:eventId/photos                   - Paginated photos feed
 * - POST /participant/events/:eventId/search                   - Face search (rate limited)
 * - GET  /participant/events/:eventId/photos/:photoId/download - Single photo download
 * - POST /participant/events/:eventId/photos/download          - Bulk download as zip
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, inArray, isNull, desc, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { activeEvents, photos, participantSearches, DEFAULT_SLIDESHOW_CONFIG } from '@sabaipics/db';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';
import { createFaceProvider } from '../../lib/rekognition/provider';
import type { FaceServiceError } from '../../lib/rekognition/types';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { createZip } from 'littlezipper';
import { slideshowPhotosQuerySchema } from '../events/slideshow-schema';

// =============================================================================
// Schemas
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

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
] as const;

const MAX_SELFIE_SIZE = 5 * 1024 * 1024; // 5 MB

const searchRequestSchema = z.object({
  selfie: z
    .instanceof(File)
    .refine((f) => f.size > 0, 'File cannot be empty')
    .refine((f) => f.size <= MAX_SELFIE_SIZE, `File size must be less than 5 MB`)
    .refine(
      (f) => ALLOWED_MIME_TYPES.includes(f.type as (typeof ALLOWED_MIME_TYPES)[number]),
      `File type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
    ),
  consentAccepted: z.preprocess((val) => val === 'true' || val === true, z.boolean()),
});

// =============================================================================
// URL Generators
// =============================================================================

function generateThumbnailUrl(
  r2Key: string,
  cfZone: string,
  r2BaseUrl: string,
  isDev: boolean,
): string {
  if (isDev) {
    return `${r2BaseUrl}/${r2Key}`;
  }
  return `https://${cfZone}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${r2BaseUrl}/${r2Key}`;
}

function generatePreviewUrl(
  r2Key: string,
  cfZone: string,
  r2BaseUrl: string,
  isDev: boolean,
): string {
  if (isDev) {
    return `${r2BaseUrl}/${r2Key}`;
  }
  return `https://${cfZone}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${r2BaseUrl}/${r2Key}`;
}

function generateDownloadUrl(r2Key: string, r2BaseUrl: string): string {
  return `${r2BaseUrl}/${r2Key}`;
}

// =============================================================================
// Error Mapping
// =============================================================================

function mapFaceServiceError(e: FaceServiceError): HandlerError {
  switch (e.type) {
    case 'not_found':
      return {
        code: 'NOT_FOUND',
        message:
          e.resource === 'collection'
            ? 'Event has no photos available for search'
            : 'No matching faces found in the event',
        cause: e,
      };

    case 'invalid_input':
      return {
        code: 'UNPROCESSABLE',
        message: `Invalid search data: ${e.reason}`,
        cause: e,
      };

    case 'provider_failed':
      switch (e.provider) {
        case 'aws': {
          const errorName = e.errorName;

          if (
            errorName &&
            [
              'ThrottlingException',
              'ProvisionedThroughputExceededException',
              'LimitExceededException',
            ].includes(errorName)
          ) {
            return {
              code: 'RATE_LIMITED',
              message: 'Too many searches. Please wait and try again.',
              cause: e,
            };
          }

          if (
            errorName &&
            [
              'ResourceNotFoundException',
              'InvalidImageFormatException',
              'ImageTooLargeException',
              'InvalidParameterException',
              'AccessDeniedException',
            ].includes(errorName)
          ) {
            return {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Face search service unavailable due to invalid request',
              cause: e,
            };
          }

          if (
            errorName &&
            ['InternalServerError', 'ServiceUnavailableException', 'ServiceException'].includes(
              errorName,
            )
          ) {
            return {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Face search temporarily unavailable',
              cause: e,
            };
          }

          return {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Face search temporarily unavailable',
            cause: e,
          };
        }

        case 'sabaiface':
          if (e.throttle) {
            return {
              code: 'RATE_LIMITED',
              message: 'Too many searches. Please wait and try again.',
              cause: e,
            };
          }

          return {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Face search temporarily unavailable',
            cause: e,
          };
      }

    case 'database':
      return {
        code: 'INTERNAL_ERROR',
        message: 'Temporary database error',
        cause: e,
      };

    default:
      return {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Face search temporarily unavailable',
        cause: e,
      };
  }
}

// =============================================================================
// Participant Router
// =============================================================================

export const participantRouter = new Hono<Env>()
  // =========================================================================
  // GET /participant/events/:eventId - Public event info
  // =========================================================================
  .get('/events/:eventId', zValidator('param', eventParamsSchema), async (c) => {
    const db = c.var.db();
    const { eventId } = c.req.valid('param');

    const [event] = await db
      .select({ name: activeEvents.name })
      .from(activeEvents)
      .where(eq(activeEvents.id, eventId))
      .limit(1);

    if (!event) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
    }

    return c.json({
      data: {
        name: event.name,
      },
    });
  })

  // =========================================================================
  // POST /participant/events/:eventId/search - Face search with rate limiting
  // =========================================================================
  .post(
    '/events/:eventId/search',
    zValidator('param', eventParamsSchema),
    zValidator('form', searchRequestSchema),
    async (c) => {
      return safeTry(async function* () {
        const { eventId } = c.req.valid('param');

        // Check rate limit (20 TPS globally for SearchFacesByImage AWS quota)
        const { success } = await c.env.SEARCH_RATE_LIMITER.limit({ key: 'global' });
        if (!success) {
          return err<never, HandlerError>({
            code: 'RATE_LIMITED',
            message: 'Too many search requests. Please try again later.',
            headers: { 'Retry-After': '10' },
          });
        }

        const db = c.var.db();
        const { selfie, consentAccepted } = c.req.valid('form');

        if (!consentAccepted) {
          return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'Consent not accepted' });
        }

        // Step 1: Validate eventId exists
        const [event] = yield* ResultAsync.fromPromise(
          db.select({ id: activeEvents.id }).from(activeEvents).where(eq(activeEvents.id, eventId)).limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Step 2: Extract IP from CF-Connecting-IP header
        const ip = c.req.header('CF-Connecting-IP') ?? null;

        // Step 3: Generate searchId (UUID)
        const searchId = crypto.randomUUID();

        // Step 4: Store selfie to R2 at selfies/{searchId}.jpg (original, no transform)
        const originalBytes = await selfie.arrayBuffer();
        const selfieR2Key = `selfies/${searchId}.jpg`;

        yield* ResultAsync.fromPromise(
          c.env.PHOTOS_BUCKET.put(selfieR2Key, originalBytes, {
            httpMetadata: { contentType: selfie.type },
          }),
          (e): HandlerError => ({
            code: 'BAD_GATEWAY',
            message: 'Storage upload failed',
            cause: e,
          }),
        );

        // Step 5: Transform selfie via CF Images (best effort, fallback to original)
        const MAX_REKOGNITION_SIZE = 5 * 1024 * 1024;
        let transformedBytes = originalBytes;
        if (originalBytes.byteLength > MAX_REKOGNITION_SIZE) {
          transformedBytes = yield* ResultAsync.fromPromise(
            (async () => {
              const stream = new ReadableStream({
                start(controller) {
                  controller.enqueue(new Uint8Array(originalBytes));
                  controller.close();
                },
              });
              const response = await c.env.IMAGES.input(stream)
                .transform({ width: 2048, height: 2048, fit: 'scale-down' })
                .output({ format: 'image/jpeg', quality: 95 });
              return await response.response().arrayBuffer();
            })(),
            (e): HandlerError => ({
              code: 'INTERNAL_ERROR',
              message: 'Failed to transform image via CF Images API',
              cause: e,
            }),
          ).orElse((transformErr) => {
            console.warn(`[search:${searchId}] Transform failed, using original`, {
              error: transformErr.message,
            });
            return ok(originalBytes);
          });
        }

        // Step 6: Call provider.findImagesByFace({ eventId, imageData })
        const provider = createFaceProvider(c.env);
        const searchResult = yield* provider
          .findImagesByFace({
            eventId,
            imageData: transformedBytes,
            maxResults: 50,
            minSimilarity: 0.8,
          })
          .mapErr(mapFaceServiceError);

        // Step 7: Handle empty response - return 200 with empty array (NOT an error)
        if (searchResult.photos.length === 0) {
          yield* ResultAsync.fromPromise(
            db
              .insert(participantSearches)
              .values({
                id: searchId,
                eventId,
                selfieR2Key,
                consentAcceptedAt: new Date().toISOString(),
                ipAddress: ip,
                matchedPhotoIds: [],
                matchCount: 0,
                searchedAt: new Date().toISOString(),
              })
              .returning(),
            (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
          );

          return ok({
            searchId,
            photos: [],
          });
        }

        // Step 8: Extract photo IDs and similarities directly from search result
        const photoIdToSimilarity = new Map(
          searchResult.photos.map((p) => [p.photoId, p.similarity]),
        );
        const matchedPhotoIds = Array.from(photoIdToSimilarity.keys());

        const photoRecords = yield* ResultAsync.fromPromise(
          db
            .select({ id: photos.id, r2Key: photos.r2Key })
            .from(photos)
            .where(inArray(photos.id, matchedPhotoIds)),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        // Step 9: Create participant_searches record
        yield* ResultAsync.fromPromise(
          db
            .insert(participantSearches)
            .values({
              id: searchId,
              eventId,
              selfieR2Key,
              consentAcceptedAt: new Date().toISOString(),
              ipAddress: ip,
              matchedPhotoIds,
              matchCount: photoRecords.length,
              searchedAt: new Date().toISOString(),
            })
            .returning(),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        // Step 10: Generate photo URLs
        const isDev = c.env.NODE_ENV === 'development';
        const responsePhotos = photoRecords.map((photo) => ({
          photoId: photo.id,
          thumbnailUrl: generateThumbnailUrl(
            photo.r2Key,
            c.env.CF_ZONE,
            c.env.PHOTO_R2_BASE_URL,
            isDev,
          ),
          previewUrl: generatePreviewUrl(
            photo.r2Key,
            c.env.CF_ZONE,
            c.env.PHOTO_R2_BASE_URL,
            isDev,
          ),
          similarity: photoIdToSimilarity.get(photo.id) ?? 0,
        }));

        return ok({
          searchId,
          photos: responsePhotos,
        });
      })
        .orTee((e) => e.cause && console.error(`[${c.req.url}] ${e.code}:`, e.cause))
        .match(
          (data) => c.json({ data }, 200),
          (e) => apiError(c, e),
        );
    },
  )

  // =========================================================================
  // GET /participant/events/:eventId/photos/:photoId/download - Single photo
  // =========================================================================
  .get(
    '/events/:eventId/photos/:photoId/download',
    zValidator('param', photoParamsSchema),
    async (c) => {
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

        const downloadUrl = generateDownloadUrl(photo.r2Key, c.env.PHOTO_R2_BASE_URL);

        return ok({ redirectUrl: downloadUrl });
      })
        .orTee((e) => e.cause && console.error(`[${c.req.url}] ${e.code}:`, e.cause))
        .match(
          (data) => c.redirect(data.redirectUrl, 302),
          (e) => apiError(c, e),
        );
    },
  )

  // =========================================================================
  // POST /participant/events/:eventId/photos/download - Bulk download as zip
  // =========================================================================
  .post(
    '/events/:eventId/photos/download',
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

        if (photoRows.length === 0) {
          return err<never, HandlerError>({
            code: 'NOT_FOUND',
            message: 'No photos found or available for download',
          });
        }

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
  )

  // =========================================================================
  // GET /participant/events/:eventId/slideshow - Slideshow info + config + stats
  // =========================================================================
  .get('/events/:eventId/slideshow', zValidator('param', eventParamsSchema), async (c) => {
    return safeTry(async function* () {
      const db = c.var.db();
      const { eventId } = c.req.valid('param');

      // Fetch event with slideshow config and logo
      const [result] = yield* ResultAsync.fromPromise(
        db
          .select({
            name: activeEvents.name,
            subtitle: activeEvents.subtitle,
            logoR2Key: activeEvents.logoR2Key,
            slideshowConfig: activeEvents.slideshowConfig,
            photoCount: sql<number>`(
              SELECT COUNT(*)::int
              FROM ${photos}
              WHERE ${photos.eventId} = ${activeEvents.id}
                AND ${photos.status} = 'indexed'
                AND ${photos.deletedAt} IS NULL
            )`,
            searchCount: sql<number>`(
              SELECT COUNT(*)::int
              FROM ${participantSearches}
              WHERE ${participantSearches.eventId} = ${activeEvents.id}
            )`,
          })
          .from(activeEvents)
          .where(eq(activeEvents.id, eventId))
          .limit(1),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
      );

      if (!result) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      // Generate logo URL if logo exists
      const logoUrl = result.logoR2Key ? `${c.env.PHOTO_R2_BASE_URL}/${result.logoR2Key}` : null;

      // Use default config if none set
      const config = result.slideshowConfig ?? DEFAULT_SLIDESHOW_CONFIG;

      return ok({
        event: {
          name: result.name,
          subtitle: result.subtitle,
          logoUrl,
        },
        config,
        stats: {
          photoCount: result.photoCount,
          searchCount: result.searchCount,
        },
      });
    })
      .orTee((e) => e.cause && console.error(`[${c.req.url}] ${e.code}:`, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // =========================================================================
  // GET /participant/events/:eventId/photos - Paginated photos feed for slideshow
  // =========================================================================
  .get(
    '/events/:eventId/photos',
    zValidator('param', eventParamsSchema),
    zValidator('query', slideshowPhotosQuerySchema),
    async (c) => {
      return safeTry(async function* () {
        const db = c.var.db();
        const { eventId } = c.req.valid('param');
        const { cursor, limit } = c.req.valid('query');

        // Verify event exists
        const [event] = yield* ResultAsync.fromPromise(
          db.select({ id: activeEvents.id }).from(activeEvents).where(eq(activeEvents.id, eventId)).limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Fetch photos (only indexed, not deleted)
        // Fetch limit + 1 to determine if there are more results
        const cursorLimit = limit + 1;

        const photoRows = yield* ResultAsync.fromPromise(
          db
            .select({
              id: photos.id,
              r2Key: photos.r2Key,
              uploadedAt: photos.uploadedAt,
              width: photos.width,
              height: photos.height,
            })
            .from(photos)
            .where(
              and(
                eq(photos.eventId, eventId),
                eq(photos.status, 'indexed'),
                isNull(photos.deletedAt),
                cursor ? lt(photos.uploadedAt, cursor) : undefined,
              ),
            )
            .orderBy(desc(photos.uploadedAt))
            .limit(cursorLimit),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        // Determine if there are more results
        const hasMore = photoRows.length > limit;
        const items = hasMore ? photoRows.slice(0, limit) : photoRows;
        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].uploadedAt : null;

        // Generate preview URLs
        const isDev = c.env.NODE_ENV === 'development';
        const data = items.map((photo) => ({
          id: photo.id,
          previewUrl: generatePreviewUrl(
            photo.r2Key,
            c.env.CF_ZONE,
            c.env.PHOTO_R2_BASE_URL,
            isDev,
          ),
          width: photo.width ?? 1,
          height: photo.height ?? 1,
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
  );
