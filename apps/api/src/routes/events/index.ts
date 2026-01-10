import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, sql } from "drizzle-orm";
import { events } from "@sabaipics/db";
import {
  requirePhotographer,
  requireConsent,
  type PhotographerVariables,
} from "../../middleware";
import type { Bindings } from "../../types";
import { generateEventQR } from "../../lib/qr";
import { generateAccessCode } from "./access-code";
import {
  createEventSchema,
  eventParamsSchema,
  listEventsQuerySchema,
} from "./schema";

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
// Helpers
// =============================================================================

/**
 * Generate QR code URL using direct R2 URL
 * Note: Uses PHOTO_R2_BASE_URL which points to the public R2 bucket
 */
function getQrCodeUrl(r2Key: string, photoBaseUrl: string): string {
  return `${photoBaseUrl}/${r2Key}`;
}

// =============================================================================
// Error Helpers
// =============================================================================

function validationError(message: string) {
  return {
    error: {
      code: "VALIDATION_ERROR" as const,
      message,
    },
  };
}

function notFoundError(message: string = "Event not found") {
  return {
    error: {
      code: "NOT_FOUND" as const,
      message,
    },
  };
}

function invalidDateRangeError() {
  return {
    error: {
      code: "INVALID_DATE_RANGE" as const,
      message: "Start date must be before or equal to end date",
    },
  };
}

function accessCodeGenerationFailedError() {
  return {
    error: {
      code: "ACCESS_CODE_GENERATION_FAILED" as const,
      message: "Failed to generate unique access code. Please try again.",
    },
  };
}

function qrGenerationFailedError(reason: string) {
  return {
    error: {
      code: "QR_GENERATION_FAILED" as const,
      message: `Failed to generate QR code: ${reason}`,
    },
  };
}

function qrUploadFailedError(reason: string) {
  return {
    error: {
      code: "QR_UPLOAD_FAILED" as const,
      message: `Failed to upload QR code: ${reason}`,
    },
  };
}

// =============================================================================
// Routes
// =============================================================================

export const eventsRouter = new Hono<Env>()

  // POST /events - Create event with QR code
  .post(
    "/",
    requirePhotographer(),
    requireConsent(),
    zValidator("json", createEventSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const body = c.req.valid("json");

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

      console.log(`[QR] Starting QR generation for access code: ${accessCode}`);
      console.log(`[QR] APP_BASE_URL: ${c.env.APP_BASE_URL}`);

      // Generate QR code PNG
      let qrPng: Uint8Array;
      try {
        qrPng = await generateEventQR(accessCode, c.env.APP_BASE_URL);
        console.log(`[QR] QR code generated successfully`);
        console.log(`[QR] - Type: ${qrPng.constructor.name}`);
        console.log(`[QR] - Length: ${qrPng.length} bytes`);
        console.log(`[QR] - First 8 bytes (PNG magic): ${Array.from(qrPng.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      } catch (e) {
        console.error(`[QR] QR generation failed:`, e);
        const reason = e instanceof Error ? e.message : "unknown error";
        return c.json(qrGenerationFailedError(reason), 500);
      }

      // Upload QR to R2
      const r2Key = `qr/${accessCode}.png`;
      console.log(`[QR] Uploading to R2 with key: ${r2Key}`);
      console.log(`[QR] Bucket binding: PHOTOS_BUCKET`);

      try {
        await c.env.PHOTOS_BUCKET.put(r2Key, qrPng, {
          httpMetadata: { contentType: "image/png" },
        });
        console.log(`[QR] Successfully uploaded to R2`);
      } catch (e) {
        console.error(`[QR] R2 upload failed:`, e);
        const reason = e instanceof Error ? e.message : "unknown error";
        return c.json(qrUploadFailedError(reason), 500);
      }

      // Use direct R2 URL
      const qrCodeUrl = getQrCodeUrl(r2Key, c.env.PHOTO_R2_BASE_URL);
      console.log(`[QR] Final QR code URL: ${qrCodeUrl}`);
      console.log(`[QR] PHOTO_R2_BASE_URL: ${c.env.PHOTO_R2_BASE_URL}`);

      // Calculate expiry date (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Insert event record
      const [created] = await db
        .insert(events)
        .values({
          photographerId: photographer.id,
          name: body.name,
          startDate: body.startDate,
          endDate: body.endDate,
          accessCode,
          qrCodeR2Key: r2Key,
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
            qrCodeUrl,
            rekognitionCollectionId: created.rekognitionCollectionId,
            expiresAt: created.expiresAt,
            createdAt: created.createdAt,
          },
        },
        201
      );
    }
  )

  // GET /events - List photographer's events (with pagination)
  .get(
    "/",
    requirePhotographer(),
    requireConsent(),
    zValidator("query", listEventsQuerySchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { page, limit } = c.req.valid("query");

      const offset = page * limit;

      const eventsList = await db
        .select({
          id: events.id,
          name: events.name,
          startDate: events.startDate,
          endDate: events.endDate,
          accessCode: events.accessCode,
          qrCodeR2Key: events.qrCodeR2Key,
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

      // Construct QR URLs using direct R2 URL
      const photoBaseUrl = c.env.PHOTO_R2_BASE_URL;
      const data = eventsList.map((event) => ({
        ...event,
        qrCodeUrl: event.qrCodeR2Key
          ? getQrCodeUrl(event.qrCodeR2Key, photoBaseUrl)
          : null,
      }));

      return c.json({
        data,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage,
          hasPrevPage,
        },
      });
    }
  )

  // GET /events/:id - Get single event
  .get(
    "/:id",
    requirePhotographer(),
    requireConsent(),
    zValidator("param", eventParamsSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid("param");

      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, id))
        .limit(1);

      if (!event) {
        return c.json(notFoundError(), 404);
      }

      // Authorization: ensure photographer owns this event
      if (event.photographerId !== photographer.id) {
        // Return NOT_FOUND instead of FORBIDDEN to prevent enumeration
        return c.json(notFoundError(), 404);
      }

      const photoBaseUrl = c.env.PHOTO_R2_BASE_URL;
      const qrCodeUrl = event.qrCodeR2Key
        ? getQrCodeUrl(event.qrCodeR2Key, photoBaseUrl)
        : null;

      return c.json({
        data: {
          id: event.id,
          photographerId: event.photographerId,
          name: event.name,
          startDate: event.startDate,
          endDate: event.endDate,
          accessCode: event.accessCode,
          qrCodeUrl,
          rekognitionCollectionId: event.rekognitionCollectionId,
          expiresAt: event.expiresAt,
          createdAt: event.createdAt,
        },
      });
    }
  );
