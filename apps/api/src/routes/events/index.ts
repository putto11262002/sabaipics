import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { events } from '@sabaipics/db';
import { requirePhotographer, requireConsent, type PhotographerVariables } from '../../middleware';
import type { Bindings } from '../../types';
import { generateEventQR, type QRSize } from '../../lib/qr';
import { generateAccessCode } from './access-code';
import { createEventSchema, eventParamsSchema, listEventsQuerySchema } from './schema';

// =============================================================================
// Types
// =============================================================================

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// =============================================================================
// Error Helpers
// =============================================================================

function validationError(message: string) {
  return {
    error: {
      code: 'VALIDATION_ERROR' as const,
      message,
    },
  };
}

function notFoundError(message: string = 'Event not found') {
  return {
    error: {
      code: 'NOT_FOUND' as const,
      message,
    },
  };
}

function invalidDateRangeError() {
  return {
    error: {
      code: 'INVALID_DATE_RANGE' as const,
      message: 'Start date must be before or equal to end date',
    },
  };
}

function accessCodeGenerationFailedError() {
  return {
    error: {
      code: 'ACCESS_CODE_GENERATION_FAILED' as const,
      message: 'Failed to generate unique access code. Please try again.',
    },
  };
}

function qrGenerationFailedError(reason: string) {
  return {
    error: {
      code: 'QR_GENERATION_FAILED' as const,
      message: `Failed to generate QR code: ${reason}`,
    },
  };
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

      // Validate date range
      if (body.startDate && body.endDate && body.startDate > body.endDate) {
        return c.json(invalidDateRangeError(), 400);
      }

      // Generate unique access code with retry logic
      const maxRetries = 5;
      let accessCode: string | null = null;

      for (let attempts = 0; attempts < maxRetries; attempts++) {
        const candidateCode = generateAccessCode();

        // Check if code already exists
        const [existing] = await db
          .select({ id: events.id })
          .from(events)
          .where(eq(events.accessCode, candidateCode))
          .limit(1);

        if (!existing) {
          accessCode = candidateCode;
          break;
        }
      }

      if (!accessCode) {
        return c.json(accessCodeGenerationFailedError(), 500);
      }

      // Calculate expiry date (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Insert event record (QR code generated client-side, not stored)
      const [created] = await db
        .insert(events)
        .values({
          photographerId: photographer.id,
          name: body.name,
          startDate: body.startDate,
          endDate: body.endDate,
          accessCode,
          qrCodeR2Key: null, // No longer storing QR codes
          rekognitionCollectionId: null,
          expiresAt: expiresAt.toISOString(),
        })
        .returning();

      return c.json(
        {
          data: {
            id: created.id,
            photographerId: created.photographerId,
            name: created.name,
            startDate: created.startDate,
            endDate: created.endDate,
            accessCode: created.accessCode,
            qrCodeUrl: null, // Client-side generation
            rekognitionCollectionId: created.rekognitionCollectionId,
            expiresAt: created.expiresAt,
            createdAt: created.createdAt,
          },
        },
        201,
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

      const offset = page * limit;

      const eventsList = await db
        .select({
          id: events.id,
          name: events.name,
          startDate: events.startDate,
          endDate: events.endDate,
          accessCode: events.accessCode,
          createdAt: events.createdAt,
          expiresAt: events.expiresAt,
        })
        .from(events)
        .where(eq(events.photographerId, photographer.id))
        .orderBy(desc(events.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total count for pagination metadata
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(events)
        .where(eq(events.photographerId, photographer.id));

      const totalCount = countResult?.count ?? 0;
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page + 1 < totalPages;
      const hasPrevPage = page > 0;

      return c.json({
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

      const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);

      if (!event) {
        return c.json(notFoundError(), 404);
      }

      // Authorization: ensure photographer owns this event
      if (event.photographerId !== photographer.id) {
        // Return NOT_FOUND instead of FORBIDDEN to prevent enumeration
        return c.json(notFoundError(), 404);
      }

      return c.json({
        data: {
          id: event.id,
          photographerId: event.photographerId,
          name: event.name,
          startDate: event.startDate,
          endDate: event.endDate,
          accessCode: event.accessCode,
          qrCodeUrl: null, // Client-side generation
          rekognitionCollectionId: event.rekognitionCollectionId,
          expiresAt: event.expiresAt,
          createdAt: event.createdAt,
        },
      });
    },
  )

  // GET /events/:id/qr-download - Download QR code as PNG
  .get(
    '/:id/qr-download',
    requirePhotographer(),
    requireConsent(),
    zValidator('param', eventParamsSchema),
    zValidator('query', z.object({
      size: z.enum(['small', 'medium', 'large']).optional().default('medium'),
    })),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');
      const { size } = c.req.valid('query');

      const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);

      if (!event) {
        return c.json(notFoundError(), 404);
      }

      // Authorization: ensure photographer owns this event
      if (event.photographerId !== photographer.id) {
        // Return NOT_FOUND instead of FORBIDDEN to prevent enumeration
        return c.json(notFoundError(), 404);
      }

      // Generate QR code on-demand
      let qrPng: Uint8Array;
      try {
        qrPng = await generateEventQR(event.accessCode, c.env.APP_BASE_URL, size as QRSize);
      } catch (e) {
        console.error('[QR] Download generation failed:', e);
        const reason = e instanceof Error ? e.message : 'unknown error';
        return c.json(qrGenerationFailedError(reason), 500);
      }

      // Return PNG with download headers
      const sanitizedName = event.name.replace(/[^a-z0-9]/gi, '-');
      const filename = `${sanitizedName}-${size}-qr.png`;
      // Convert Uint8Array to regular ArrayBuffer for Response
      const arrayBuffer = new ArrayBuffer(qrPng.length);
      const view = new Uint8Array(arrayBuffer);
      view.set(qrPng);
      return new Response(arrayBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      });
    },
  );
