/**
 * Participant Search Endpoint
 *
 * POST /events/:eventId/search
 *
 * Public endpoint for participants to search for their photos using face recognition.
 * No authentication required - protected by consent validation and rate limiting.
 *
 * Implementation Plan: docs/logs/010_sab-16-participant-search-implementation/plan.md
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { events, photos, participantSearches } from '@sabaipics/db';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';
import { createFaceProvider } from '../../lib/rekognition/provider';
import type { FaceServiceError } from '../../lib/rekognition/types';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';

// =============================================================================
// Schema
// =============================================================================

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

const eventParamsSchema = z.object({
  eventId: z.string().uuid(),
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
  // In development, skip CF Image Resizing - use raw R2 URL
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
  // In development, skip CF Image Resizing - use raw R2 URL
  if (isDev) {
    return `${r2BaseUrl}/${r2Key}`;
  }
  return `https://${cfZone}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${r2BaseUrl}/${r2Key}`;
}

// =============================================================================
// Error Mapping
// =============================================================================

/**
 * Map FaceServiceError to HandlerError with appropriate codes and messages.
 */
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

          // Throttling errors
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

          // Non-retryable AWS errors
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

          // Retryable AWS errors
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

          // Generic AWS error
          return {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Face search temporarily unavailable',
            cause: e,
          };
        }

        case 'sabaiface':
          // SabaiFace provider errors (throttle based on HTTP status)
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
// Search Router
// =============================================================================

export const searchRouter = new Hono<Env>().post(
  '/:eventId/search',
  zValidator('param', eventParamsSchema),
  zValidator('form', searchRequestSchema),
  async (c) => {
    return safeTry(async function* () {
      const db = c.var.db();
      const { eventId } = c.req.valid('param');
      const { selfie, consentAccepted } = c.req.valid('form');

      if (!consentAccepted) {
        return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'Consent not accepted' });
      }

      // Step 1: Validate eventId exists
      const [event] = yield* ResultAsync.fromPromise(
        db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
      );

      if (!event) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      // Step 2: Validate consentAccepted === true (already handled by Zod literal)
      // Step 3: Validate selfie file (already handled by Zod schema)

      // Step 4: Extract IP from CF-Connecting-IP header
      const ip = c.req.header('CF-Connecting-IP') ?? null;

      // Step 5: Generate searchId (UUID)
      const searchId = crypto.randomUUID();

      // Step 6: Store selfie to R2 at selfies/{searchId}.jpg (original, no transform)
      const originalBytes = await selfie.arrayBuffer();
      const selfieR2Key = `selfies/${searchId}.jpg`;

      yield* ResultAsync.fromPromise(
        c.env.PHOTOS_BUCKET.put(selfieR2Key, originalBytes, {
          httpMetadata: { contentType: selfie.type },
        }),
        (e): HandlerError => ({ code: 'BAD_GATEWAY', message: 'Storage upload failed', cause: e }),
      );

      // Step 7: Transform selfie via CF Images (best effort, fallback to original)
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

      // Step 8: Call provider.findImagesByFace({ eventId, imageData })
      const provider = createFaceProvider(c.env);
      const searchResult = yield* provider
        .findImagesByFace({
          eventId,
          imageData: transformedBytes,
          maxResults: 50,
          minSimilarity: 0.8,
        })
        .mapErr(mapFaceServiceError);

      // Step 9: Handle empty response - return 200 with empty array (NOT an error)
      if (searchResult.photos.length === 0) {
        // Create participant_searches record with empty matches
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

      // Step 10: Extract photo IDs and similarities directly from search result
      const photoIdToSimilarity = new Map(
        searchResult.photos.map((p) => [p.photoId, p.similarity]),
      );
      const matchedPhotoIds = Array.from(photoIdToSimilarity.keys());

      // Query photos with those IDs
      const photoRecords = yield* ResultAsync.fromPromise(
        db
          .select({ id: photos.id, r2Key: photos.r2Key })
          .from(photos)
          .where(inArray(photos.id, matchedPhotoIds)),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
      );

      // Step 11: Create participant_searches record
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

      // Step 12: Generate photo URLs
      const isDev = c.env.NODE_ENV === 'development';
      const responsePhotos = photoRecords.map((photo) => ({
        photoId: photo.id,
        thumbnailUrl: generateThumbnailUrl(
          photo.r2Key,
          c.env.CF_ZONE,
          c.env.PHOTO_R2_BASE_URL,
          isDev,
        ),
        previewUrl: generatePreviewUrl(photo.r2Key, c.env.CF_ZONE, c.env.PHOTO_R2_BASE_URL, isDev),
        similarity: photoIdToSimilarity.get(photo.id) ?? 0,
      }));

      // Step 13: Return response
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
);
