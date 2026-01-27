import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { events } from '@sabaipics/db';
import { requirePhotographer, requireConsent } from '../../middleware';
import type { Env } from '../../types';
import { generatePngQrCode } from '@juit/qrcode';
import { createEventSchema, eventParamsSchema, listEventsQuerySchema } from './schema';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { apiError, type HandlerError } from '../../lib/error';

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
    requireConsent(),
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
    requireConsent(),
    zValidator('query', listEventsQuerySchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { page, limit } = c.req.valid('query');

      return safeTry(async function* () {
        const offset = page * limit;

        const eventsList = yield* ResultAsync.fromPromise(
          db
            .select({
              id: events.id,
              name: events.name,
              startDate: events.startDate,
              endDate: events.endDate,
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
    requireConsent(),
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
          startDate: event.startDate,
          endDate: event.endDate,
          qrCodeUrl: null, // Client-side generation
          rekognitionCollectionId: event.rekognitionCollectionId,
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
    requireConsent(),
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
  );
