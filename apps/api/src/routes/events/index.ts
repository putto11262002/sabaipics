import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, sql, asc, gt } from "drizzle-orm";
import { events, photos, creditLedger, photographers } from "@sabaipics/db";
import {
  requirePhotographer,
  requireConsent,
  type PhotographerVariables,
} from "../../middleware";
import type { Bindings } from "../../types";
import type { PhotoJob } from "../../types/photo-job";
import { generateEventQR } from "../../lib/qr";
import { generateAccessCode } from "./access-code";
import {
  normalizeImage,
  DEFAULT_NORMALIZE_OPTIONS,
} from "../../lib/images/normalize";
import {
  createEventSchema,
  eventParamsSchema,
  listEventsQuerySchema,
  uploadPhotoSchema,
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

function insufficientCreditsError() {
  return {
    error: {
      code: "INSUFFICIENT_CREDITS" as const,
      message: "Insufficient credits. Purchase more to continue.",
    },
  };
}

function eventExpiredError() {
  return {
    error: {
      code: "EVENT_EXPIRED" as const,
      message: "This event has expired",
    },
  };
}

function uploadFailedError(reason: string) {
  return {
    error: {
      code: "UPLOAD_FAILED" as const,
      message: `Upload failed: ${reason}`,
    },
  };
}

function imageTransformFailedError(reason: string) {
  return {
    error: {
      code: "IMAGE_TRANSFORM_FAILED" as const,
      message: `Image transformation failed: ${reason}`,
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

      // Generate QR code PNG
      let qrPng: Uint8Array;
      try {
        qrPng = await generateEventQR(accessCode, c.env.APP_BASE_URL);
      } catch (e) {
        const reason = e instanceof Error ? e.message : "unknown error";
        return c.json(qrGenerationFailedError(reason), 500);
      }

      // Upload QR to R2
      const r2Key = `qr/${accessCode}.png`;
      try {
        await c.env.PHOTOS_BUCKET.put(r2Key, qrPng, {
          httpMetadata: { contentType: "image/png" },
        });
      } catch (e) {
        const reason = e instanceof Error ? e.message : "unknown error";
        return c.json(qrUploadFailedError(reason), 500);
      }

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

      // Construct QR URL (using R2 public URL pattern)
      // TODO: Confirm R2 public URL format - may need adjustment based on bucket config
      const qrCodeUrl = `${c.env.APP_BASE_URL}/r2/${r2Key}`;

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

      // Construct QR URLs
      const baseUrl = c.env.APP_BASE_URL;
      const data = eventsList.map((event) => ({
        ...event,
        qrCodeUrl: event.qrCodeR2Key
          ? `${baseUrl}/r2/${event.qrCodeR2Key}`
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

      const baseUrl = c.env.APP_BASE_URL;
      const qrCodeUrl = event.qrCodeR2Key
        ? `${baseUrl}/r2/${event.qrCodeR2Key}`
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
  )

  // POST /events/:id/photos - Upload photo to event
  .post(
    "/:id/photos",
    requirePhotographer(),
    requireConsent(),
    zValidator("param", eventParamsSchema),
    zValidator("form", uploadPhotoSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id: eventId } = c.req.valid("param");
      const { file } = c.req.valid("form");

      // 1. Verify event exists, is owned by photographer, and not expired
      const [event] = await db
        .select({
          id: events.id,
          photographerId: events.photographerId,
          expiresAt: events.expiresAt,
        })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        return c.json(notFoundError(), 404);
      }

      // Authorization: ensure photographer owns this event
      if (event.photographerId !== photographer.id) {
        return c.json(notFoundError(), 404);
      }

      // Check if event has expired
      if (new Date(event.expiresAt) < new Date()) {
        return c.json(eventExpiredError(), 410);
      }

      // Extract file bytes for normalization (after validation, before deduction)
      const arrayBuffer = await file.arrayBuffer();

      // 2. Check credit balance and deduct within transaction
      let photo: typeof photos.$inferSelect;

      try {
        photo = await db.transaction(async (tx) => {
          // Lock photographer row to prevent race conditions
          await tx
            .select({ id: photographers.id })
            .from(photographers)
            .where(eq(photographers.id, photographer.id))
            .for("update");

          // Calculate current balance
          const [balanceResult] = await tx
            .select({
              balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int`,
            })
            .from(creditLedger)
            .where(
              and(
                eq(creditLedger.photographerId, photographer.id),
                gt(creditLedger.expiresAt, sql`NOW()`)
              )
            );

          const balance = balanceResult?.balance ?? 0;

          if (balance < 1) {
            throw new Error("INSUFFICIENT_CREDITS");
          }

          // Find oldest unexpired purchase for FIFO expiry
          const [oldestCredit] = await tx
            .select({ expiresAt: creditLedger.expiresAt })
            .from(creditLedger)
            .where(
              and(
                eq(creditLedger.photographerId, photographer.id),
                gt(creditLedger.amount, 0),
                gt(creditLedger.expiresAt, sql`NOW()`)
              )
            )
            .orderBy(asc(creditLedger.expiresAt))
            .limit(1);

          if (!oldestCredit) {
            throw new Error("NO_UNEXPIRED_CREDITS");
          }

          // Deduct 1 credit with FIFO expiry
          await tx.insert(creditLedger).values({
            photographerId: photographer.id,
            amount: -1,
            type: "upload",
            expiresAt: oldestCredit.expiresAt,
            stripeSessionId: null,
          });

          // Create photo record with status='processing'
          const [newPhoto] = await tx
            .insert(photos)
            .values({
              eventId,
              r2Key: "", // Temporary, will be set below
              status: "processing",
              faceCount: 0,
            })
            .returning();

          // Set correct r2Key now that we have photo.id
          const r2Key = `${eventId}/${newPhoto.id}.jpg`;
          await tx
            .update(photos)
            .set({ r2Key })
            .where(eq(photos.id, newPhoto.id));

          return { ...newPhoto, r2Key };
        });
      } catch (err) {
        const error = err as Error;
        if (error.message === "INSUFFICIENT_CREDITS") {
          return c.json(insufficientCreditsError(), 402);
        }
        if (error.message === "NO_UNEXPIRED_CREDITS") {
          console.error("Data integrity error: Balance check passed but no unexpired credits found");
          return c.json(insufficientCreditsError(), 402);
        }
        throw err;
      }

      // 3. Normalize image in-memory (before R2 upload)
      let normalizedImageBytes: ArrayBuffer;
      try {
        normalizedImageBytes = await normalizeImage(
          arrayBuffer,
          file.type,
          c.env.PHOTOS_BUCKET,
          c.env.PHOTO_R2_BASE_URL,
          DEFAULT_NORMALIZE_OPTIONS
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : "unknown error";
        console.error(`Image normalization failed for photo ${photo.id}: ${reason}`, {
          photographerId: photographer.id,
          photoId: photo.id,
          eventId,
          creditsDeducted: 1,
        });
        return c.json(imageTransformFailedError(reason), 500);
      }

      // 4. Upload normalized JPEG to R2 (single operation)
      try {
        await c.env.PHOTOS_BUCKET.put(photo.r2Key, normalizedImageBytes, {
          httpMetadata: { contentType: "image/jpeg" },
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : "unknown error";
        console.error(`R2 upload failed for photo ${photo.id}: ${reason}`, {
          photographerId: photographer.id,
          photoId: photo.id,
          eventId,
          creditsDeducted: 1,
        });
        return c.json(uploadFailedError(reason), 500);
      }

      // 5. Enqueue job for face detection
      try {
        const job: PhotoJob = {
          photo_id: photo.id,
          event_id: eventId,
          r2_key: photo.r2Key,
        };
        await c.env.PHOTO_QUEUE.send(job);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "unknown error";
        console.error(`Queue enqueue failed for photo ${photo.id}: ${reason}`, {
          photographerId: photographer.id,
          photoId: photo.id,
          eventId,
          creditsDeducted: 1,
        });
        // Note: Photo is uploaded and credit deducted, but queue failed
        // Return 500 but photo remains in 'processing' state
        return c.json(uploadFailedError(`Queue enqueue failed: ${reason}`), 500);
      }

      // 6. Return success response
      return c.json(
        {
          data: {
            id: photo.id,
            eventId: photo.eventId,
            r2Key: photo.r2Key,
            status: photo.status,
            faceCount: photo.faceCount,
            uploadedAt: photo.uploadedAt,
          },
        },
        201
      );
    }
  );
