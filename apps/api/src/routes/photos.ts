import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, lt, inArray, sql, asc, gt, isNull } from 'drizzle-orm';
import { photos, events, photoStatuses, creditLedger, photographers, Photo } from '@sabaipics/db';
import { requirePhotographer, requireConsent, type PhotographerVariables } from '../middleware';
import type { Bindings } from '../types';
import type { PhotoJob } from '../types/photo-job';
import {
  normalizeImage,
  DEFAULT_NORMALIZE_OPTIONS,
  type NormalizeResult,
} from '../lib/images/normalize';
import { createZip } from 'littlezipper';

// =============================================================================
// Types
// =============================================================================

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

// =============================================================================
// Zod Schemas
// =============================================================================

const listPhotosParamsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
});

const listPhotosQuerySchema = z.object({
  cursor: z.string().datetime('Invalid cursor format').optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50')
    .default(20),
  status: z.array(z.enum(photoStatuses)).optional(),
});

// Photo upload validation
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
] as const;

const uploadPhotoSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, 'File cannot be empty')
    .refine(
      (file) => file.size <= MAX_FILE_SIZE,
      `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024} MB`,
    )
    .refine(
      (file) => ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number]),
      `File type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
    ),
  eventId: z.string().uuid('Invalid event ID format'),
});

// =============================================================================
// Error Helpers
// =============================================================================

function notFoundError(message: string = 'Not found') {
  return {
    error: {
      code: 'NOT_FOUND' as const,
      message,
    },
  };
}

function insufficientCreditsError() {
  return {
    error: {
      code: 'INSUFFICIENT_CREDITS' as const,
      message: 'Insufficient credits. Purchase more to continue.',
    },
  };
}

function eventExpiredError() {
  return {
    error: {
      code: 'EVENT_EXPIRED' as const,
      message: 'This event has expired',
    },
  };
}

function uploadFailedError(reason: string) {
  return {
    error: {
      code: 'UPLOAD_FAILED' as const,
      message: `Upload failed: ${reason}`,
    },
  };
}

function imageTransformFailedError(reason: string) {
  return {
    error: {
      code: 'IMAGE_TRANSFORM_FAILED' as const,
      message: `Image transformation failed: ${reason}`,
    },
  };
}

// =============================================================================
// URL Generators
// =============================================================================

// Public transform URLs (cached at edge)
function generateThumbnailUrl(r2Key: string, cfDomain: string, r2BaseUrl: string): string {
  if (process.env.NODE_ENV === 'development') {
    return `${r2BaseUrl}/${r2Key}`;
  }
  return `${cfDomain}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${r2BaseUrl}/${r2Key}`;
}

function generatePreviewUrl(r2Key: string, cfDomain: string, r2BaseUrl: string): string {
  if (process.env.NODE_ENV === 'development') {
    return `${r2BaseUrl}/${r2Key}`;
  }
  return `${cfDomain}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${r2BaseUrl}/${r2Key}`;
}

// =============================================================================
// Routes
// =============================================================================

// Photos listing router - mounted at /events
export const photosListRouter = new Hono<Env>().get(
  '/:eventId/photos',
  requirePhotographer(),
  zValidator('param', listPhotosParamsSchema),
  zValidator('query', listPhotosQuerySchema),
  async (c) => {
    const { eventId } = c.req.valid('param');
    const { cursor, limit, status } = c.req.valid('query');

    const photographer = c.var.photographer;
    const db = c.var.db();

    // CRITICAL: Verify event ownership BEFORE querying photos
    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
      .limit(1);

    if (!event) {
      return c.json(notFoundError('Event not found'), 404);
    }

    // Cursor-based pagination: fetch limit + 1 to determine hasMore
    const parsedLimit = Math.min(limit, 50);
    const cursorLimit = parsedLimit + 1;

    const photoRows = await db
      .select({
        id: photos.id,
        r2Key: photos.r2Key,
        status: photos.status,
        faceCount: photos.faceCount,
        fileSize: photos.fileSize,
        uploadedAt: photos.uploadedAt,
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
      .limit(cursorLimit);

    // Determine hasMore and trim extra row
    const hasMore = photoRows.length > parsedLimit;
    const items = hasMore ? photoRows.slice(0, parsedLimit) : photoRows;
    const nextCursor = hasMore ? items[parsedLimit - 1].uploadedAt : null;

    // Generate URLs for each photo
    const data = items.map((photo) => ({
      id: photo.id,
      thumbnailUrl: generateThumbnailUrl(photo.r2Key, c.env.CF_ZONE, c.env.PHOTO_R2_BASE_URL),
      previewUrl: generatePreviewUrl(photo.r2Key, c.env.CF_ZONE, c.env.PHOTO_R2_BASE_URL),
      faceCount: photo.faceCount,
      fileSize: photo.fileSize,
      status: photo.status,
      uploadedAt: photo.uploadedAt,
    }));

    return c.json({
      data,
      pagination: {
        nextCursor,
        hasMore,
      },
    });
  },
);

// Bulk download router - mounted at /events
const bulkDownloadSchema = z.object({
  photoIds: z.array(z.string().uuid('Invalid photo ID format')).min(1).max(15, 'Maximum 15 photos per download'),
});

export const bulkDownloadRouter = new Hono<Env>().post(
  '/:eventId/photos/download',
  requirePhotographer(),
  zValidator('param', listPhotosParamsSchema),
  zValidator('json', bulkDownloadSchema),
  async (c) => {
    const { eventId } = c.req.valid('param');
    const { photoIds } = c.req.valid('json');
    const photographer = c.var.photographer;
    const db = c.var.db();

    console.log(`[Bulk Download] Starting download`, {
      eventId,
      photoIds,
      photographerId: photographer.id,
    });

    // CRITICAL: Verify event ownership BEFORE fetching photos
    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
      .limit(1);

    if (!event) {
      console.log(`[Bulk Download] Event not found or access denied`);
      return c.json(notFoundError('Event not found'), 404);
    }

    // Fetch photos with ownership verification (exclude deleted)
    const photoRows = await db
      .select({
        id: photos.id,
        r2Key: photos.r2Key,
        uploadedAt: photos.uploadedAt,
      })
      .from(photos)
      .where(and(
        eq(photos.eventId, eventId),
        inArray(photos.id, photoIds),
        isNull(photos.deletedAt),
      ));

    // Verify all requested photos exist
    if (photoRows.length !== photoIds.length) {
      console.log(`[Bulk Download] Some photos not found`, {
        requested: photoIds.length,
        found: photoRows.length,
      });
      return c.json(
        {
          error: {
            code: 'PHOTOS_NOT_FOUND',
            message: 'Some photos were not found',
          },
        },
        404,
      );
    }

    console.log(`[Bulk Download] Fetching photos from R2`, {
      count: photoRows.length,
    });

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

    console.log(`[Bulk Download] Creating zip file`, {
      entryCount: zipEntries.length,
    });

    // Create zip file
    const zipData = await createZip(zipEntries);

    const filename = `${eventId}-photos.zip`;

    console.log(`[Bulk Download] Zip created`, {
      filename,
      size: zipData.length,
    });

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
);

// Photos upload router - mounted at /photos
export const photosUploadRouter = new Hono<Env>().post(
  '/',
  requirePhotographer(),
  requireConsent(),
  zValidator('form', uploadPhotoSchema),
  async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.db();
    const { file, eventId } = c.req.valid('form');

    console.log(`[Upload] Starting photo upload`, {
      photographerId: photographer.id,
      eventId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

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
      console.log(`[Upload] Event not found: ${eventId}`);
      return c.json(notFoundError('Event not found'), 404);
    }

    // Authorization: ensure photographer owns this event
    if (event.photographerId !== photographer.id) {
      console.log(`[Upload] Photographer does not own event`, {
        photographerId: photographer.id,
        eventPhotographerId: event.photographerId,
      });
      return c.json(notFoundError('Event not found'), 404);
    }

    // Check if event has expired
    if (new Date(event.expiresAt) < new Date()) {
      console.log(`[Upload] Event expired`, {
        eventId,
        expiresAt: event.expiresAt,
      });
      return c.json(eventExpiredError(), 410);
    }

    // Capture original file metadata before normalization
    const originalMimeType = file.type;
    const originalFileSize = file.size;

    // Extract file bytes for normalization (after validation, before deduction)
    const arrayBuffer = await file.arrayBuffer();
    console.log(`[Upload] File bytes extracted`, {
      size: arrayBuffer.byteLength,
      originalMimeType,
      originalFileSize,
    });

    // 2. Check credit balance and deduct within transaction
    let photo: Photo;

    try {
      console.log(`[Upload] Checking credit balance`, {
        photographerId: photographer.id,
      });

      // Lock photographer row to prevent race conditions
      await db
        .select({ id: photographers.id })
        .from(photographers)
        .where(eq(photographers.id, photographer.id))
        .for('update');

      // Calculate current balance
      const [balanceResult] = await db
        .select({
          balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int`,
        })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.photographerId, photographer.id),
            gt(creditLedger.expiresAt, sql`NOW()`),
          ),
        );

      const balance = balanceResult?.balance ?? 0;

      console.log(`[Upload] Credit balance: ${balance}`);

      if (balance < 1) {
        console.log(`[Upload] Insufficient credits`, { balance });
        throw new Error('INSUFFICIENT_CREDITS');
      }

      // Find oldest unexpired purchase for FIFO expiry
      const [oldestCredit] = await db
        .select({ expiresAt: creditLedger.expiresAt })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.photographerId, photographer.id),
            gt(creditLedger.amount, 0),
            gt(creditLedger.expiresAt, sql`NOW()`),
          ),
        )
        .orderBy(asc(creditLedger.expiresAt))
        .limit(1);

      if (!oldestCredit) {
        throw new Error('NO_UNEXPIRED_CREDITS');
      }

      // Deduct 1 credit with FIFO expiry
      await db.insert(creditLedger).values({
        photographerId: photographer.id,
        amount: -1,
        type: 'upload',
        expiresAt: oldestCredit.expiresAt,
        stripeSessionId: null,
      });

      console.log(`[Upload] Credit deducted`, {
        newBalance: balance - 1,
      });

      // Create photo record with status='uploading'
      const [newPhoto] = await db
        .insert(photos)
        .values({
          eventId,
          r2Key: '', // Temporary, will be set below
          status: 'uploading',
          faceCount: 0,
        })
        .returning();

      console.log(`[Upload] Photo record created`, {
        photoId: newPhoto.id,
        status: newPhoto.status,
      });

      // Set correct r2Key now that we have photo.id
      const r2Key = `${eventId}/${newPhoto.id}.jpg`;
      await db.update(photos).set({ r2Key }).where(eq(photos.id, newPhoto.id));

      console.log(`[Upload] R2 key set`, {
        photoId: newPhoto.id,
        r2Key,
      });

      photo = { ...newPhoto, r2Key };
    } catch (err) {
      const error = err as Error;
      if (error.message === 'INSUFFICIENT_CREDITS') {
        return c.json(insufficientCreditsError(), 402);
      }
      if (error.message === 'NO_UNEXPIRED_CREDITS') {
        console.error('Data integrity error: Balance check passed but no unexpired credits found');
        return c.json(insufficientCreditsError(), 402);
      }
      throw err;
    }

    // 3. Normalize image in-memory (before R2 upload)
    let normalizeResult: NormalizeResult;
    try {
      console.log(`[Upload] Starting image normalization`, {
        photoId: photo.id,
        originalSize: arrayBuffer.byteLength,
      });

      normalizeResult = await normalizeImage(
        arrayBuffer,
        originalMimeType,
        c.env.PHOTOS_BUCKET,
        c.env.PHOTO_R2_BASE_URL,
        DEFAULT_NORMALIZE_OPTIONS,
      );

      console.log(`[Upload] Image normalized`, {
        photoId: photo.id,
        normalizedSize: normalizeResult.bytes.byteLength,
        width: normalizeResult.width,
        height: normalizeResult.height,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      console.error(`[Upload] Image normalization failed for photo ${photo.id}: ${reason}`, {
        photographerId: photographer.id,
        photoId: photo.id,
        eventId,
        creditsDeducted: 1,
      });
      return c.json(imageTransformFailedError(reason), 500);
    }

    // Capture normalized image metadata
    const { bytes: normalizedImageBytes, width, height } = normalizeResult;
    const fileSize = normalizedImageBytes.byteLength;

    // 4. Upload normalized JPEG to R2 (single operation)
    try {
      console.log(`[Upload] Uploading to R2`, {
        photoId: photo.id,
        r2Key: photo.r2Key,
        size: normalizedImageBytes.byteLength,
      });

      await c.env.PHOTOS_BUCKET.put(photo.r2Key, normalizedImageBytes, {
        httpMetadata: { contentType: 'image/jpeg' },
      });

      console.log(`[Upload] R2 upload successful`, {
        photoId: photo.id,
        r2Key: photo.r2Key,
      });

      // Update photo record with metadata
      await db
        .update(photos)
        .set({
          originalMimeType,
          originalFileSize,
          width,
          height,
          fileSize,
        })
        .where(eq(photos.id, photo.id));

      console.log(`[Upload] Photo metadata saved`, {
        photoId: photo.id,
        originalMimeType,
        originalFileSize,
        width,
        height,
        fileSize,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      console.error(`[Upload] R2 upload failed for photo ${photo.id}: ${reason}`, {
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

      console.log(`[Upload] Enqueueing to PHOTO_QUEUE`, {
        photoId: photo.id,
        r2Key: photo.r2Key,
        eventId,
      });

      await c.env.PHOTO_QUEUE.send(job);

      console.log(`[Upload] Successfully enqueued to PHOTO_QUEUE`, {
        photoId: photo.id,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      console.error(`[Upload] Queue enqueue failed for photo ${photo.id}: ${reason}`, {
        photographerId: photographer.id,
        photoId: photo.id,
        eventId,
        creditsDeducted: 1,
      });
      return c.json(uploadFailedError(`Queue enqueue failed: ${reason}`), 500);
    }

    // 6. Return success response
    console.log(`[Upload] Upload complete`, {
      photoId: photo.id,
      eventId,
      r2Key: photo.r2Key,
    });

    return c.json(
      {
        data: {
          id: photo.id,
          eventId: photo.eventId,
          r2Key: photo.r2Key,
          status: photo.status,
          faceCount: photo.faceCount,
          fileSize,
          uploadedAt: photo.uploadedAt,
        },
      },
      201,
    );
  },
);

// Batch photo status router - mounted at /photos
const photosStatusQuerySchema = z.object({
  ids: z
    .string()
    .transform((val) => val.split(',').filter(Boolean))
    .pipe(z.array(z.string().uuid('Invalid photo ID format')).min(1).max(50)),
});

export const photoStatusRouter = new Hono<Env>().get(
  '/status',
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
        photographerId: events.photographerId,
      })
      .from(photos)
      .innerJoin(events, eq(photos.eventId, events.id))
      .where(inArray(photos.id, ids));

    // Filter to only photos owned by this photographer
    const ownedPhotos = photoRows.filter((p) => p.photographerId === photographer.id);

    const data = ownedPhotos.map((photo) => ({
      id: photo.id,
      status: photo.status,
      errorName: photo.errorName,
      faceCount: photo.faceCount,
      fileSize: photo.fileSize,
      thumbnailUrl: generateThumbnailUrl(photo.r2Key, c.env.CF_ZONE, c.env.PHOTO_R2_BASE_URL),
      uploadedAt: photo.uploadedAt,
    }));

    return c.json({ data });
  },
);

// Bulk soft delete router - mounted at /events
const bulkDeleteSchema = z.object({
  photoIds: z.array(z.string().uuid('Invalid photo ID format')).min(1).max(50, 'Maximum 50 photos per delete'),
});

export const bulkDeleteRouter = new Hono<Env>().post(
  '/:eventId/photos/delete',
  requirePhotographer(),
  zValidator('param', listPhotosParamsSchema),
  zValidator('json', bulkDeleteSchema),
  async (c) => {
    const { eventId } = c.req.valid('param');
    const { photoIds } = c.req.valid('json');
    const photographer = c.var.photographer;
    const db = c.var.db();

    console.log(`[Bulk Delete] Starting soft delete`, {
      eventId,
      photoIds,
      photographerId: photographer.id,
    });

    // CRITICAL: Verify event ownership BEFORE deleting photos
    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
      .limit(1);

    if (!event) {
      console.log(`[Bulk Delete] Event not found or access denied`);
      return c.json(notFoundError('Event not found'), 404);
    }

    // Soft delete photos (only non-deleted photos belonging to this event)
    const result = await db
      .update(photos)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(
        eq(photos.eventId, eventId),
        inArray(photos.id, photoIds),
        isNull(photos.deletedAt),
      ))
      .returning({ id: photos.id });

    console.log(`[Bulk Delete] Soft deleted photos`, {
      requested: photoIds.length,
      deleted: result.length,
    });

    return c.json({
      data: {
        deletedCount: result.length,
        deletedIds: result.map((r) => r.id),
      },
    });
  },
);

// Legacy export for backward compatibility (renamed internally)
export const photosRouter = photosListRouter;
