import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { events, DEFAULT_SLIDESHOW_CONFIG, logoUploadIntents } from '@sabaipics/db';
import { requirePhotographer } from '../../middleware';
import type { Env } from '../../types';
import { generatePngQrCode } from '@juit/qrcode';
import { createEventSchema, eventParamsSchema, listEventsQuerySchema } from './schema';
import { slideshowConfigSchema } from './slideshow-schema';
import { logoPresignSchema, logoStatusQuerySchema } from './logo-schema';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { apiError, type HandlerError } from '../../lib/error';
import { generatePresignedPutUrl } from '../../lib/r2/presign';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// =============================================================================
// QR Code Generation
// =============================================================================

type QRSize = 'small' | 'medium' | 'large';

const QR_SIZE_PRESETS: Record<QRSize, number> = {
  small: 256,
  medium: 512,
  large: 1200,
} as const;

function getScaleForSize(size: QRSize): number {
  return Math.ceil(QR_SIZE_PRESETS[size] / 25);
}

async function generateEventQR(
  eventId: string,
  baseUrl: string,
  size: QRSize = 'medium',
): Promise<Uint8Array> {
  const searchUrl = `${baseUrl}/participant/events/${eventId}/search`;

  return await generatePngQrCode(searchUrl, {
    ecLevel: 'M',
    margin: 4,
    scale: getScaleForSize(size),
  });
}

// =============================================================================
// Routes
// =============================================================================

export const eventsRouter = new Hono<Env>()

  // POST /events - Create event (QR code generated client-side)
  .post(
    '/',
    requirePhotographer(),

    zValidator('json', createEventSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const body = c.req.valid('json');

      return safeTry(async function* () {
        // Validate date range
        if (body.startDate && body.endDate && body.startDate > body.endDate) {
          return err<never, HandlerError>({
            code: 'BAD_REQUEST',
            message: 'Start date must be before or equal to end date',
          });
        }

        // Calculate expiry date (30 days from now)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        // Insert event record (QR code generated client-side, not stored)
        const [created] = yield* ResultAsync.fromPromise(
          db
            .insert(events)
            .values({
              photographerId: photographer.id,
              name: body.name,
              startDate: body.startDate,
              endDate: body.endDate,
              qrCodeR2Key: null, // No longer storing QR codes
              rekognitionCollectionId: null,
              expiresAt: expiresAt.toISOString(),
            })
            .returning(),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        return ok({
          id: created.id,
          photographerId: created.photographerId,
          name: created.name,
          startDate: created.startDate,
          endDate: created.endDate,
          qrCodeUrl: null, // Client-side generation
          rekognitionCollectionId: created.rekognitionCollectionId,
          expiresAt: created.expiresAt,
          createdAt: created.createdAt,
        });
      })
        .orTee((e) => e.cause && console.error('[Events] POST /', e.code, e.cause))
        .match(
          (data) => c.json({ data }, 201),
          (e) => apiError(c, e),
        );
    },
  )

  // GET /events - List photographer's events (with pagination)
  .get(
    '/',
    requirePhotographer(),

    zValidator('query', listEventsQuerySchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { page, limit } = c.req.valid('query');

      return safeTry(async function* () {
        const offset = page * limit;

        const eventsListRaw = yield* ResultAsync.fromPromise(
          db
            .select({
              id: events.id,
              name: events.name,
              subtitle: events.subtitle,
              startDate: events.startDate,
              endDate: events.endDate,
              logoR2Key: events.logoR2Key,
              createdAt: events.createdAt,
              expiresAt: events.expiresAt,
            })
            .from(events)
            .where(eq(events.photographerId, photographer.id))
            .orderBy(desc(events.createdAt))
            .limit(limit)
            .offset(offset),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        // Get total count for pagination metadata
        const [countResult] = yield* ResultAsync.fromPromise(
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(events)
            .where(eq(events.photographerId, photographer.id)),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        const totalCount = countResult?.count ?? 0;
        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page + 1 < totalPages;
        const hasPrevPage = page > 0;

        // Map logoR2Key to logoUrl
        const eventsList = eventsListRaw.map((event) => ({
          id: event.id,
          name: event.name,
          subtitle: event.subtitle,
          startDate: event.startDate,
          endDate: event.endDate,
          logoUrl: event.logoR2Key ? `${c.env.PHOTO_R2_BASE_URL}/${event.logoR2Key}` : null,
          createdAt: event.createdAt,
          expiresAt: event.expiresAt,
        }));

        return ok({
          data: eventsList,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNextPage,
            hasPrevPage,
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] GET /', e.code, e.cause))
        .match(
          (result) => c.json(result),
          (e) => apiError(c, e),
        );
    },
  )

  // GET /events/:id - Get single event
  .get(
    '/:id',
    requirePhotographer(),

    zValidator('param', eventParamsSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');

      return safeTry(async function* () {
        const [event] = yield* ResultAsync.fromPromise(
          db.select().from(events).where(eq(events.id, id)).limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Authorization: ensure photographer owns this event
        if (event.photographerId !== photographer.id) {
          // Return NOT_FOUND instead of FORBIDDEN to prevent enumeration
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        return ok({
          id: event.id,
          photographerId: event.photographerId,
          name: event.name,
          subtitle: event.subtitle,
          startDate: event.startDate,
          endDate: event.endDate,
          qrCodeUrl: null, // Client-side generation
          rekognitionCollectionId: event.rekognitionCollectionId,
          logoUrl: event.logoR2Key ? `${c.env.PHOTO_R2_BASE_URL}/${event.logoR2Key}` : null,
          expiresAt: event.expiresAt,
          createdAt: event.createdAt,
        });
      })
        .orTee((e) => e.cause && console.error('[Events] GET /:id', e.code, e.cause))
        .match(
          (data) => c.json({ data }),
          (e) => apiError(c, e),
        );
    },
  )

  // GET /events/:id/qr-download - Download QR code as PNG
  .get(
    '/:id/qr-download',
    requirePhotographer(),

    zValidator('param', eventParamsSchema),
    zValidator(
      'query',
      z.object({
        size: z.enum(['small', 'medium', 'large']).optional().default('medium'),
      }),
    ),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');
      const { size } = c.req.valid('query');

      return safeTry(async function* () {
        const [event] = yield* ResultAsync.fromPromise(
          db.select().from(events).where(eq(events.id, id)).limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Authorization: ensure photographer owns this event
        if (event.photographerId !== photographer.id) {
          // Return NOT_FOUND instead of FORBIDDEN to prevent enumeration
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Generate QR code on-demand
        const qrPng = yield* ResultAsync.fromPromise(
          generateEventQR(event.id, c.env.EVENT_FRONTEND_URL, size as QRSize),
          (cause): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate QR code',
            cause,
          }),
        );

        // Return PNG with download headers
        const sanitizedName = event.name.replace(/[^a-z0-9]/gi, '-');
        const filename = `${sanitizedName}-${size}-qr.png`;
        // Convert Uint8Array to regular ArrayBuffer for Response
        const arrayBuffer = new ArrayBuffer(qrPng.length);
        const view = new Uint8Array(arrayBuffer);
        view.set(qrPng);
        return ok(
          new Response(arrayBuffer, {
            headers: {
              'Content-Type': 'image/png',
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            },
          }),
        );
      })
        .orTee((e) => e.cause && console.error('[Events] GET /:id/qr-download', e.code, e.cause))
        .match(
          (response) => response,
          (e) => apiError(c, e),
        );
    },
  )

  // =========================================================================
  // GET /events/:id/slideshow-config - Get slideshow configuration
  // =========================================================================
  .get(
    '/:id/slideshow-config',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');

      return safeTry(async function* () {
        // Verify event ownership
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({
              id: events.id,
              slideshowConfig: events.slideshowConfig,
            })
            .from(events)
            .where(and(eq(events.id, id), eq(events.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Return default config if none set
        const config = event.slideshowConfig ?? DEFAULT_SLIDESHOW_CONFIG;

        return ok({ data: config });
      })
        .orTee(
          (e) => e.cause && console.error('[Events] GET /:id/slideshow-config', e.code, e.cause),
        )
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  // =========================================================================
  // PUT /events/:id/slideshow-config - Update slideshow configuration
  // =========================================================================
  .put(
    '/:id/slideshow-config',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    zValidator('json', slideshowConfigSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');
      const config = c.req.valid('json');

      return safeTry(async function* () {
        // Verify event ownership
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: events.id })
            .from(events)
            .where(and(eq(events.id, id), eq(events.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Update slideshow config
        const [updated] = yield* ResultAsync.fromPromise(
          db
            .update(events)
            .set({ slideshowConfig: config })
            .where(eq(events.id, id))
            .returning({ slideshowConfig: events.slideshowConfig }),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        return ok({ data: updated.slideshowConfig });
      })
        .orTee(
          (e) => e.cause && console.error('[Events] PUT /:id/slideshow-config', e.code, e.cause),
        )
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  // =========================================================================
  // POST /events/:id/logo/presign - Generate presigned URL for logo upload
  // =========================================================================
  .post(
    '/:id/logo/presign',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    zValidator('json', logoPresignSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id: eventId } = c.req.valid('param');
      const { contentType, contentLength } = c.req.valid('json');

      return safeTry(async function* () {
        // Verify event ownership and not expired
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: events.id, expiresAt: events.expiresAt })
            .from(events)
            .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Check if event expired
        if (new Date(event.expiresAt) < new Date()) {
          return err<never, HandlerError>({ code: 'GONE', message: 'Event has expired' });
        }

        // Generate upload ID and R2 key
        const uploadId = crypto.randomUUID();
        const timestamp = Date.now();
        const r2Key = `${eventId}/logo/${uploadId}-${timestamp}`;

        // Generate presigned URL (5 minutes expiry)
        const PRESIGN_EXPIRY_SECONDS = 5 * 60;
        const expiresAt = new Date(Date.now() + PRESIGN_EXPIRY_SECONDS * 1000);

        const { url: putUrl } = yield* ResultAsync.fromPromise(
          generatePresignedPutUrl(
            c.env.CF_ACCOUNT_ID,
            c.env.R2_ACCESS_KEY_ID,
            c.env.R2_SECRET_ACCESS_KEY,
            {
              bucket: c.env.PHOTO_BUCKET_NAME,
              key: r2Key,
              contentType,
              contentLength,
              expiresIn: PRESIGN_EXPIRY_SECONDS,
            },
          ),
          (cause): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate upload URL',
            cause,
          }),
        );

        // Create logo upload intent record
        yield* ResultAsync.fromPromise(
          db.insert(logoUploadIntents).values({
            id: uploadId,
            photographerId: photographer.id,
            eventId,
            r2Key,
            contentType,
            contentLength,
            status: 'pending',
            expiresAt: expiresAt.toISOString(),
          }),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        return ok({
          data: {
            uploadId,
            putUrl,
            objectKey: r2Key,
            expiresAt: expiresAt.toISOString(),
            requiredHeaders: {
              'Content-Type': contentType,
              'Content-Length': contentLength.toString(),
              'If-None-Match': '*',
            },
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] POST /:id/logo/presign', e.code, e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  // =========================================================================
  // GET /events/:id/logo/status - Poll logo upload status
  // =========================================================================
  .get(
    '/:id/logo/status',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    zValidator('query', logoStatusQuerySchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id: eventId } = c.req.valid('param');
      const { id: uploadId } = c.req.valid('query');

      return safeTry(async function* () {
        // Verify event ownership
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: events.id, logoR2Key: events.logoR2Key })
            .from(events)
            .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Fetch logo upload intent
        const [intent] = yield* ResultAsync.fromPromise(
          db
            .select({
              uploadId: logoUploadIntents.id,
              eventId: logoUploadIntents.eventId,
              status: logoUploadIntents.status,
              errorCode: logoUploadIntents.errorCode,
              errorMessage: logoUploadIntents.errorMessage,
              uploadedAt: logoUploadIntents.uploadedAt,
              completedAt: logoUploadIntents.completedAt,
              expiresAt: logoUploadIntents.expiresAt,
            })
            .from(logoUploadIntents)
            .where(
              and(
                eq(logoUploadIntents.id, uploadId),
                eq(logoUploadIntents.eventId, eventId),
                eq(logoUploadIntents.photographerId, photographer.id),
              ),
            )
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!intent) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Upload not found' });
        }

        // Generate logo URL if completed
        const logoUrl =
          intent.status === 'completed' && event.logoR2Key
            ? `${c.env.PHOTO_R2_BASE_URL}/${event.logoR2Key}`
            : null;

        return ok({
          data: {
            uploadId: intent.uploadId,
            eventId: intent.eventId,
            status: intent.status,
            errorCode: intent.errorCode,
            errorMessage: intent.errorMessage,
            logoUrl,
            uploadedAt: intent.uploadedAt,
            completedAt: intent.completedAt,
            expiresAt: intent.expiresAt,
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] GET /:id/logo/status', e.code, e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  // =========================================================================
  // DELETE /events/:id/logo - Remove logo from event
  // =========================================================================
  .delete('/:id/logo', requirePhotographer(), zValidator('param', eventParamsSchema), async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.db();
    const { id: eventId } = c.req.valid('param');

    return safeTry(async function* () {
      // Verify event ownership
      const [event] = yield* ResultAsync.fromPromise(
        db
          .select({ id: events.id })
          .from(events)
          .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!event) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      // Remove logo reference (actual R2 cleanup via lifecycle policy)
      yield* ResultAsync.fromPromise(
        db.update(events).set({ logoR2Key: null }).where(eq(events.id, eventId)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({ data: { success: true } });
    })
      .orTee((e) => e.cause && console.error('[Events] DELETE /:id/logo', e.code, e.cause))
      .match(
        (data) => c.json(data),
        (e) => apiError(c, e),
      );
  });
