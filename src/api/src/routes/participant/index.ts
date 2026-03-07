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
 * - POST /participant/feedback                                 - Submit anonymous feedback
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, inArray, isNull, desc, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { activeEvents, photos, participantSearches, participantSessions, selfies, downloads, events, feedback, feedbackCategories, type EventSettings } from '@/db';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';
import { createExtractor, searchByFace, type RecognitionError, FACE_SEARCH_MAX_RESULTS, FACE_SEARCH_MIN_SIMILARITY } from '../../lib/recognition';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { createZip } from 'littlezipper';
import { slideshowPhotosQuerySchema } from '../events/slideshow-schema';
import { slideshowSettingsSchema } from '../events/slideshow-settings-schema';
import { capturePostHogEvent } from '../../lib/posthog';
import { emitCounterMetric, emitHistogramMetricMs } from '../../lib/observability/metrics';

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
  searchId: z.string().uuid('Invalid search ID format').optional(),
  method: z.enum(['zip', 'share', 'single']).optional().default('zip'),
});

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const MAX_SELFIE_SIZE = 10 * 1024 * 1024; // 10 MB
const E2E_HISTOGRAM_BOUNDS_MS = [
  100, 250, 500, 1000, 2500, 5000, 10000, 15000, 30000, 60000, 120000,
];

const searchRequestSchema = z.object({
  selfie: z
    .instanceof(File)
    .refine((f) => f.size > 0, 'File cannot be empty')
    .refine((f) => f.size <= MAX_SELFIE_SIZE, `File size must be less than 10 MB`)
    .refine(
      (f) => ALLOWED_MIME_TYPES.includes(f.type as (typeof ALLOWED_MIME_TYPES)[number]),
      `File type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
    )
    .optional(),
  selfieId: z.string().uuid('Invalid selfie ID').optional(),
  consentAccepted: z.preprocess((val) => val === 'true' || val === true, z.boolean()),
}).refine(
  (data) => data.selfie || data.selfieId,
  { message: 'Either selfie file or selfieId is required' },
);

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

function mapRecognitionError(e: RecognitionError): HandlerError {
  switch (e.type) {
    case 'no_face_detected':
      return {
        code: 'UNPROCESSABLE',
        message: 'No face detected in the uploaded image. Please try a clearer photo.',
        cause: e,
      };

    case 'invalid_image':
      return {
        code: 'UNPROCESSABLE',
        message: `Invalid image: ${e.reason}`,
        cause: e,
      };

    case 'extraction_failed':
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

    case 'database':
      return {
        code: 'INTERNAL_ERROR',
        message: 'Temporary database error',
        cause: e,
      };
  }
}

// =============================================================================
// Participant Router
// =============================================================================

export const participantRouter = new Hono<Env>()
  // =========================================================================
  // GET /participant/session - Current session state
  // =========================================================================
  .get('/session', async (c) => {
    const session = c.var.participantSession;
    if (!session) {
      return c.json({ data: null });
    }

    // Fetch all non-deleted selfies for this session (newest first)
    let sessionSelfies: Array<{ id: string; thumbnailUrl: string }> = [];
    if (session.consentAcceptedAt) {
      const db = c.var.db();
      const isDev = c.env.NODE_ENV === 'development';
      const selfieRows = await db
        .select({ id: selfies.id, r2Key: selfies.r2Key })
        .from(selfies)
        .where(and(eq(selfies.sessionId, session.id), isNull(selfies.deletedAt)))
        .orderBy(desc(selfies.createdAt));

      sessionSelfies = selfieRows.map((s) => ({
        id: s.id,
        thumbnailUrl: isDev
          ? `${c.env.PHOTO_R2_BASE_URL}/${s.r2Key}`
          : `https://${c.env.CF_ZONE}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${c.env.PHOTO_R2_BASE_URL}/${s.r2Key}`,
      }));
    }

    return c.json({
      data: {
        hasConsent: !!session.consentAcceptedAt,
        lineUserId: session.lineUserId,
        isFriend: session.isFriend,
        selfies: sessionSelfies,
      },
    });
  })

  // =========================================================================
  // POST /participant/session/consent - Record PDPA consent
  // =========================================================================
  .post('/session/consent', async (c) => {
    const session = c.var.participantSession;
    if (!session) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'No session' } }, 401);
    }
    if (!session.consentAcceptedAt) {
      const db = c.var.db();
      await db
        .update(participantSessions)
        .set({ consentAcceptedAt: new Date().toISOString() })
        .where(eq(participantSessions.id, session.id));
    }
    return c.json({ data: { ok: true } });
  })

  // =========================================================================
  // DELETE /participant/session/selfies/:selfieId - Soft delete a selfie
  // =========================================================================
  .delete('/session/selfies/:selfieId', async (c) => {
    const session = c.var.participantSession;
    if (!session) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'No session' } }, 401);
    }

    const selfieId = c.req.param('selfieId');
    const db = c.var.db();

    const result = await db
      .update(selfies)
      .set({ deletedAt: new Date().toISOString() })
      .where(
        and(
          eq(selfies.id, selfieId),
          eq(selfies.sessionId, session.id),
          isNull(selfies.deletedAt),
        ),
      )
      .returning({ id: selfies.id });

    if (result.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Selfie not found' } }, 404);
    }

    return c.json({ data: { ok: true } });
  })

  // =========================================================================
  // DELETE /participant/session - Hard delete all session data (PDPA)
  // =========================================================================
  .delete('/session', async (c) => {
    const session = c.var.participantSession;
    if (!session) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'No session' } }, 401);
    }

    const db = c.var.db();

    // Get selfie R2 keys before deletion
    const selfieRows = await db
      .select({ r2Key: selfies.r2Key })
      .from(selfies)
      .where(eq(selfies.sessionId, session.id));

    // Hard delete session — cascades to selfies + downloads.
    // participant_searches and line_deliveries get sessionId set null (anonymized).
    await db
      .delete(participantSessions)
      .where(eq(participantSessions.id, session.id));

    // Clean up selfie R2 objects
    if (selfieRows.length > 0) {
      await Promise.all(
        selfieRows.map((s) => c.env.PHOTOS_BUCKET.delete(s.r2Key)),
      );
    }

    return c.json({ data: { ok: true } });
  })

  // =========================================================================
  // GET /participant/events/:eventId - Public event info
  // =========================================================================
  .get('/events/:eventId', zValidator('param', eventParamsSchema), async (c) => {
    const db = c.var.db();
    const { eventId } = c.req.valid('param');

    const [event] = await db
      .select({
        name: activeEvents.name,
        subtitle: activeEvents.subtitle,
        logoR2Key: activeEvents.logoR2Key,
      })
      .from(activeEvents)
      .where(eq(activeEvents.id, eventId))
      .limit(1);

    if (!event) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
    }

    const logoUrl = event.logoR2Key ? `${c.env.PHOTO_R2_BASE_URL}/${event.logoR2Key}` : null;

    return c.json({
      data: {
        name: event.name,
        subtitle: event.subtitle,
        logoUrl,
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
      const searchStartedAt = Date.now();
      const searchSource = 'participant';
      let extractDurationMs: number | null = null;
      let vectorSearchDurationMs: number | null = null;
      let extractStatus: 'ok' | 'error' | null = null;
      let vectorSearchStatus: 'ok' | 'error' | null = null;
      const emitSearchMetrics = (status: 'ok' | 'error') => {
        emitCounterMetric(
          c.env,
          c.executionCtx as unknown as ExecutionContext,
          'framefast_search_e2e_total',
          1,
          {
            source: searchSource,
            status,
          },
        );
        emitHistogramMetricMs(
          c.env,
          c.executionCtx as unknown as ExecutionContext,
          'framefast_search_e2e_duration_ms',
          Date.now() - searchStartedAt,
          {
            source: searchSource,
            status,
          },
          E2E_HISTOGRAM_BOUNDS_MS,
        );
        if (extractDurationMs !== null && extractStatus) {
          emitHistogramMetricMs(
            c.env,
            c.executionCtx as unknown as ExecutionContext,
            'framefast_search_stage_duration_ms',
            extractDurationMs,
            {
              source: searchSource,
              stage: 'face_extraction',
              status: extractStatus,
            },
          );
        }
        if (vectorSearchDurationMs !== null && vectorSearchStatus) {
          emitHistogramMetricMs(
            c.env,
            c.executionCtx as unknown as ExecutionContext,
            'framefast_search_stage_duration_ms',
            vectorSearchDurationMs,
            {
              source: searchSource,
              stage: 'vector_search',
              status: vectorSearchStatus,
            },
          );
        }
      };
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
        const { selfie, selfieId: existingSelfieId, consentAccepted } = c.req.valid('form');

        if (!consentAccepted) {
          return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'Consent not accepted' });
        }

        // Step 1: Validate eventId exists
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id })
            .from(activeEvents)
            .where(eq(activeEvents.id, eventId))
            .limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Step 2: Extract IP from CF-Connecting-IP header
        const ip = c.req.header('CF-Connecting-IP') ?? null;

        // Step 3: Generate searchId (UUID)
        const searchId = crypto.randomUUID();

        const session = c.var.participantSession;
        let selfieId: string | undefined;
        let selfieR2Key: string;
        let queryEmbedding: number[];

        // === Path A: Reuse existing selfie with cached embedding ===
        if (existingSelfieId) {
          const [existingSelfie] = yield* ResultAsync.fromPromise(
            db
              .select({ id: selfies.id, r2Key: selfies.r2Key, embedding: selfies.embedding })
              .from(selfies)
              .where(
                and(
                  eq(selfies.id, existingSelfieId),
                  session ? eq(selfies.sessionId, session.id) : undefined,
                  isNull(selfies.deletedAt),
                ),
              )
              .limit(1),
            (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
          );

          if (!existingSelfie) {
            return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Selfie not found' });
          }

          selfieId = existingSelfie.id;
          selfieR2Key = existingSelfie.r2Key;

          if (existingSelfie.embedding) {
            // Fast path: use cached embedding, skip extraction entirely
            queryEmbedding = existingSelfie.embedding;
            extractStatus = 'ok';
            extractDurationMs = 0;
          } else {
            // Selfie exists but no cached embedding — fetch from R2 and extract
            const selfieObject = yield* ResultAsync.fromPromise(
              c.env.PHOTOS_BUCKET.get(existingSelfie.r2Key),
              (e): HandlerError => ({ code: 'BAD_GATEWAY', message: 'Storage fetch failed', cause: e }),
            );

            if (!selfieObject) {
              return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Selfie file not found in storage' });
            }

            const selfieBytes = await selfieObject.arrayBuffer();
            const extractor = createExtractor({
              endpoint: c.env.RECOGNITION_ENDPOINT,
              modalKey: c.env.MODAL_KEY!,
              modalSecret: c.env.MODAL_SECRET!,
            });
            const extractStartedAt = Date.now();
            const extractAttempt = await extractor.extractFaces(selfieBytes).mapErr(mapRecognitionError);
            extractDurationMs = Date.now() - extractStartedAt;
            if (extractAttempt.isErr()) {
              extractStatus = 'error';
              return err<never, HandlerError>(extractAttempt.error);
            }
            extractStatus = 'ok';
            const extractResult = extractAttempt.value;
            if (extractResult.faces.length === 0) {
              return err(mapRecognitionError({ type: 'no_face_detected', retryable: false, throttle: false }));
            }
            queryEmbedding = extractResult.faces[0].embedding;

            // Cache the embedding for next time
            c.executionCtx.waitUntil(
              db
                .update(selfies)
                .set({ embedding: queryEmbedding })
                .where(eq(selfies.id, selfieId!))
                .catch((e) => console.error('[Selfie embedding cache]', e)),
            );
          }
        }
        // === Path B: New selfie upload ===
        else {
          // Step 4: Store selfie to R2 at selfies/{searchId}.jpg (original, no transform)
          const originalBytes = await selfie!.arrayBuffer();
          selfieR2Key = `selfies/${searchId}.jpg`;

          yield* ResultAsync.fromPromise(
            c.env.PHOTOS_BUCKET.put(selfieR2Key, originalBytes, {
              httpMetadata: { contentType: selfie!.type },
            }),
            (e): HandlerError => ({
              code: 'BAD_GATEWAY',
              message: 'Storage upload failed',
              cause: e,
            }),
          );

          // Step 5: Transform selfie via CF Images if too large (best effort, fallback to original)
          const MAX_EXTRACTION_SIZE = 5 * 1024 * 1024;
          let transformedBytes = originalBytes;
          if (originalBytes.byteLength > MAX_EXTRACTION_SIZE) {
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

          // Step 6: Extract face embedding from selfie
          const extractor = createExtractor({
            endpoint: c.env.RECOGNITION_ENDPOINT,
            modalKey: c.env.MODAL_KEY!,
            modalSecret: c.env.MODAL_SECRET!,
          });
          const extractStartedAt = Date.now();
          const extractAttempt = await extractor.extractFaces(transformedBytes).mapErr(mapRecognitionError);
          extractDurationMs = Date.now() - extractStartedAt;
          if (extractAttempt.isErr()) {
            extractStatus = 'error';
            return err<never, HandlerError>(extractAttempt.error);
          }
          extractStatus = 'ok';
          const extractResult = extractAttempt.value;

          // Guard: extraction succeeded but no face found
          if (extractResult.faces.length === 0) {
            return err(mapRecognitionError({ type: 'no_face_detected', retryable: false, throttle: false }));
          }

          queryEmbedding = extractResult.faces[0].embedding;

          // Step 6b: Face found — now create selfie record with embedding
          if (session) {
            const [selfieRecord] = yield* ResultAsync.fromPromise(
              db
                .insert(selfies)
                .values({ sessionId: session.id, r2Key: selfieR2Key, embedding: queryEmbedding })
                .returning({ id: selfies.id }),
              (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
            );
            selfieId = selfieRecord.id;

            // Set consent on session if not already set
            if (!session.consentAcceptedAt) {
              c.executionCtx.waitUntil(
                db
                  .update(participantSessions)
                  .set({ consentAcceptedAt: new Date().toISOString() })
                  .where(eq(participantSessions.id, session.id)),
              );
            }
          }
        }

        // Step 7: Search pgvector for similar faces in the event
        const vectorSearchStartedAt = Date.now();
        const searchMatchesResult = await searchByFace(c.var.db(), {
          eventId,
          embedding: queryEmbedding,
          maxResults: FACE_SEARCH_MAX_RESULTS,
          minSimilarity: FACE_SEARCH_MIN_SIMILARITY,
        }).mapErr(mapRecognitionError);
        vectorSearchDurationMs = Date.now() - vectorSearchStartedAt;
        if (searchMatchesResult.isErr()) {
          vectorSearchStatus = 'error';
          return err<never, HandlerError>(searchMatchesResult.error);
        }
        vectorSearchStatus = 'ok';
        const searchMatches = searchMatchesResult.value;

        // Step 8: Handle empty response - return 200 with empty array (NOT an error)
        if (searchMatches.length === 0) {
          yield* ResultAsync.fromPromise(
            db
              .insert(participantSearches)
              .values({
                id: searchId,
                sessionId: session?.id,
                selfieId,
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

          c.executionCtx.waitUntil(
            capturePostHogEvent(c.env.POSTHOG_API_KEY, {
              distinctId: `search_${searchId}`,
              event: 'search_completed',
              properties: { event_id: eventId, match_count: 0, has_matches: false },
            }),
          );

          return ok({
            searchId,
            photos: [],
          });
        }

        // Step 9: Extract photo IDs and similarities from pgvector results
        const photoIdToSimilarity = new Map(
          searchMatches.map((p) => [p.photoId, p.similarity]),
        );
        const matchedPhotoIds = Array.from(photoIdToSimilarity.keys());

        const photoRecords = yield* ResultAsync.fromPromise(
          db
            .select({ id: photos.id, r2Key: photos.r2Key })
            .from(photos)
            .where(inArray(photos.id, matchedPhotoIds)),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        // Step 10: Create participant_searches record
        yield* ResultAsync.fromPromise(
          db
            .insert(participantSearches)
            .values({
              id: searchId,
              sessionId: session?.id,
              selfieId,
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

        // Step 11: Track search completion
        c.executionCtx.waitUntil(
          capturePostHogEvent(c.env.POSTHOG_API_KEY, {
            distinctId: `search_${searchId}`,
            event: 'search_completed',
            properties: {
              event_id: eventId,
              match_count: photoRecords.length,
              has_matches: photoRecords.length > 0,
            },
          }),
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
          (data) => {
            emitSearchMetrics('ok');
            return c.json({ data }, 200);
          },
          (e) => {
            emitSearchMetrics('error');
            return apiError(c, e);
          },
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
                inArray(photos.status, ['indexing', 'indexed']),
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

        c.executionCtx.waitUntil(
          capturePostHogEvent(c.env.POSTHOG_API_KEY, {
            distinctId: `participant_${eventId}`,
            event: 'photos_delivered',
            properties: {
              event_id: eventId,
              delivery_method: 'download',
              photo_count: 1,
            },
          }),
        );

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
      const { photoIds, searchId, method } = c.req.valid('json');

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
                inArray(photos.status, ['indexing', 'indexed']),
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

        c.executionCtx.waitUntil(
          capturePostHogEvent(c.env.POSTHOG_API_KEY, {
            distinctId: `participant_${eventId}`,
            event: 'photos_delivered',
            properties: {
              event_id: eventId,
              delivery_method: 'download',
              photo_count: photoRows.length,
            },
          }),
        );

        // Track download in DB (fire and forget)
        const dlSession = c.var.participantSession;
        if (dlSession && searchId) {
          c.executionCtx.waitUntil(
            db
              .insert(downloads)
              .values({
                sessionId: dlSession.id,
                searchId,
                eventId,
                photoIds,
                method,
                photoCount: photoRows.length,
              })
              .catch((e) => console.error('[Download tracking]', e)),
          );
        }

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
  // GET /participant/events/:eventId/photos/matched - All matched photos for session
  // =========================================================================
  .get('/events/:eventId/photos/matched', zValidator('param', eventParamsSchema), async (c) => {
    const session = c.var.participantSession;
    if (!session) {
      return c.json({ data: [] });
    }

    const { eventId } = c.req.valid('param');
    const db = c.var.db();

    // Get all searches for this session + event
    const searches = await db
      .select({ matchedPhotoIds: participantSearches.matchedPhotoIds })
      .from(participantSearches)
      .where(
        and(
          eq(participantSearches.sessionId, session.id),
          eq(participantSearches.eventId, eventId),
          isNull(participantSearches.deletedAt),
        ),
      );

    // Deduplicate photo IDs across all searches
    const allPhotoIds = new Set<string>();
    for (const search of searches) {
      if (search.matchedPhotoIds) {
        for (const id of search.matchedPhotoIds) {
          if (id) allPhotoIds.add(id);
        }
      }
    }

    if (allPhotoIds.size === 0) {
      return c.json({ data: [] });
    }

    // Fetch photo records
    const photoRows = await db
      .select({
        id: photos.id,
        r2Key: photos.r2Key,
      })
      .from(photos)
      .where(
        and(
          inArray(photos.id, Array.from(allPhotoIds)),
          eq(photos.status, 'indexed'),
          isNull(photos.deletedAt),
        ),
      );

    const isDev = c.env.NODE_ENV === 'development';
    const data = photoRows.map((photo) => ({
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
    }));

    return c.json({ data });
  })

  // =========================================================================
  // GET /participant/events/:eventId/slideshow - Slideshow info + config + stats
  // =========================================================================
  .get('/events/:eventId/slideshow', zValidator('param', eventParamsSchema), async (c) => {
    return safeTry(async function* () {
      const db = c.var.db();
      const { eventId } = c.req.valid('param');

      // Fetch event with settings and logo
      const [result] = yield* ResultAsync.fromPromise(
        db
          .select({
            name: activeEvents.name,
            subtitle: activeEvents.subtitle,
            logoR2Key: activeEvents.logoR2Key,
            settings: activeEvents.settings,
            photoCount: sql<number>`(
              SELECT COUNT(*)::int
              FROM ${photos}
              WHERE ${photos.eventId} = ${activeEvents.id}
                AND ${photos.status} IN ('indexing', 'indexed')
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

      // Extract settings with defaults
      const settings = (result.settings ?? {}) as EventSettings;

      // Validate settings at API boundary - use defaults if invalid
      const rawConfig = {
        template: settings?.slideshow?.template ?? 'carousel',
        primaryColor: settings?.theme?.primary ?? '#ff6320',
        background: settings?.theme?.background ?? '#fdfdfd',
      };

      const parseResult = slideshowSettingsSchema.safeParse(rawConfig);
      const config = parseResult.success
        ? parseResult.data
        : {
            template: 'carousel' as const,
            primaryColor: '#ff6320',
            background: '#fdfdfd',
          };

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
          db
            .select({ id: activeEvents.id })
            .from(activeEvents)
            .where(eq(activeEvents.id, eventId))
            .limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Fetch photos (indexing + indexed = visible to guests, not deleted)
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
                inArray(photos.status, ['indexing', 'indexed']),
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
  )

  // =========================================================================
  // POST /participant/feedback - Submit anonymous feedback
  // =========================================================================
  .post(
    '/feedback',
    zValidator(
      'json',
      z.object({
        content: z.string().min(1).max(2000),
        category: z.enum(feedbackCategories).optional().default('general'),
        eventId: z.string().uuid().optional(),
      }),
    ),
    async (c) => {
      const input = c.req.valid('json');
      const db = c.var.db();

      return safeTry(async function* () {
        const [created] = yield* ResultAsync.fromPromise(
          db
            .insert(feedback)
            .values({
              content: input.content,
              category: input.category,
              source: 'event_app',
              eventId: input.eventId,
              photographerId: null,
            })
            .returning(),
          (cause): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to submit feedback',
            cause,
          }),
        );

        return ok(created);
      })
        .orTee((e) => e.cause && console.error('[Participant/Feedback]', e.code, e.cause))
        .match(
          (data) => c.json({ data }, 201),
          (e) => apiError(c, e),
        );
    },
  );
