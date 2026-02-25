/**
 * Presigned URL Upload Route
 *
 * Generates presigned URLs for direct R2 uploads.
 * Client uploads directly to R2, triggering event notification
 * which is processed by the upload-consumer queue.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, gt, lt, sql, inArray, desc } from 'drizzle-orm';
import { activeEvents, uploadIntents, photos } from '@/db';
import { requirePhotographer, type PhotographerVariables } from '../middleware';
import type { Env, Bindings } from '../types';
import { apiError, type HandlerError } from '../lib/error';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { generatePresignedPutUrl } from '../lib/r2/presign';
import { getBalance } from '../lib/credits';
import { ALLOWED_MIME_TYPES } from '../lib/event/constants';
import { PHOTO_MAX_FILE_SIZE } from '../lib/upload/constants';
import { capturePostHogEvent } from '../lib/posthog';

// =============================================================================
// Constants
// =============================================================================

const PRESIGN_TTL_SECONDS = 300; // 5 minutes

const REPRESSIGN_ALLOWED_STATUSES = ['pending', 'expired', 'failed'] as const;

// =============================================================================
// Schemas
// =============================================================================

const presignRequestSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  contentType: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({ message: `Content type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` }),
  }),
  contentLength: z
    .number()
    .int('Content length must be an integer')
    .positive('Content length must be positive')
    .max(
      PHOTO_MAX_FILE_SIZE,
      `File size must be less than ${PHOTO_MAX_FILE_SIZE / 1024 / 1024} MB`,
    ),
  filename: z.string().optional(),
  source: z.enum(['web', 'ios']).optional(),
});

const statusQuerySchema = z.object({
  ids: z.preprocess(
    (val) => (typeof val === 'string' ? val.split(',') : val),
    z.array(z.string().uuid('Invalid upload ID format')).min(1).max(50, 'Maximum 50 IDs allowed'),
  ),
});

const repressignParamsSchema = z.object({
  uploadId: z.string().uuid('Invalid upload ID format'),
});

const listIntentsParamsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
});

const listIntentsQuerySchema = z.object({
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50')
    .default(10),
});

// =============================================================================
// URL Generators
// =============================================================================

function generateThumbnailUrl(env: Bindings, r2Key: string): string {
  if (env.NODE_ENV === 'development') {
    return `${env.PHOTO_R2_BASE_URL}/${r2Key}`;
  }
  return `https://${env.CF_ZONE}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${env.PHOTO_R2_BASE_URL}/${r2Key}`;
}

// =============================================================================
// Route
// =============================================================================

export const uploadsRouter = new Hono<Env>()
  .post('/presign', requirePhotographer(), zValidator('json', presignRequestSchema), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { eventId, contentType, contentLength, source } = c.req.valid('json');

      // 1. Verify event exists, is owned by photographer, and not expired
      const [event] = yield* ResultAsync.fromPromise(
        db
          .select({
            id: activeEvents.id,
            photographerId: activeEvents.photographerId,
            expiresAt: activeEvents.expiresAt,
          })
          .from(activeEvents)
          .where(eq(activeEvents.id, eventId))
          .limit(1),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
      );

      if (!event || event.photographerId !== photographer.id) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      if (new Date(event.expiresAt) < new Date()) {
        return err<never, HandlerError>({ code: 'GONE', message: 'This event has expired' });
      }

      // 2. Quick credit check (fail fast, no lock)
      const balance = yield* getBalance(db, photographer.id).mapErr(
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Database error',
          cause: e.cause,
        }),
      );

      if (balance < 1) {
        return err<never, HandlerError>({
          code: 'PAYMENT_REQUIRED',
          message: 'Insufficient credits. Purchase more to continue.',
        });
      }

      // 3. Generate unique R2 key
      const uploadId = crypto.randomUUID();
      const timestamp = Date.now();
      const r2Key = `uploads/${eventId}/${uploadId}-${timestamp}`;

      // 4. Generate presigned URL
      const presignResult = yield* ResultAsync.fromPromise(
        generatePresignedPutUrl(
          c.env.CF_ACCOUNT_ID,
          c.env.R2_ACCESS_KEY_ID,
          c.env.R2_SECRET_ACCESS_KEY,
          {
            bucket: c.env.PHOTO_BUCKET_NAME,
            key: r2Key,
            contentType,
            contentLength,
            expiresIn: PRESIGN_TTL_SECONDS,
          },
        ),
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate upload URL',
          cause: e,
        }),
      );

      // 5. Create upload intent record
      const [intent] = yield* ResultAsync.fromPromise(
        db
          .insert(uploadIntents)
          .values({
            id: uploadId,
            photographerId: photographer.id,
            eventId,
            r2Key,
            contentType,
            contentLength,
            source: source ?? 'web',
            status: 'pending',
            expiresAt: presignResult.expiresAt.toISOString(),
          })
          .returning(),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
      );

      // 6. Track upload event
      c.executionCtx.waitUntil(
        capturePostHogEvent(c.env.POSTHOG_API_KEY, {
          distinctId: c.get('auth')!.userId,
          event: 'photo_uploaded',
          properties: {
            event_id: eventId,
            source: source ?? 'web',
            content_type: contentType,
            content_length: contentLength,
          },
        }),
      );

      // 7. Return presigned URL details
      return ok({
        uploadId: intent.id,
        putUrl: presignResult.url,
        objectKey: r2Key,
        expiresAt: presignResult.expiresAt.toISOString(),
        requiredHeaders: {
          'Content-Type': contentType,
          'Content-Length': contentLength.toString(),
          'If-None-Match': '*',
        },
      });
    })
      .orTee((e) => e.cause && console.error(`[uploads/presign] ${e.code}:`, e.cause))
      .match(
        (data) => c.json({ data }, 201),
        (e) => apiError(c, e),
      );
  })

  // =========================================================================
  // GET /uploads/status - Poll upload intent status (SAB-47)
  // =========================================================================
  .get('/status', requirePhotographer(), zValidator('query', statusQuerySchema), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { ids } = c.req.valid('query');

      const intents = yield* ResultAsync.fromPromise(
        db
          .select({
            id: uploadIntents.id,
            eventId: uploadIntents.eventId,
            status: uploadIntents.status,
            errorCode: uploadIntents.errorCode,
            errorMessage: uploadIntents.errorMessage,
            photoId: uploadIntents.photoId,
            completedAt: uploadIntents.completedAt,
            expiresAt: uploadIntents.expiresAt,
          })
          .from(uploadIntents)
          .where(
            and(inArray(uploadIntents.id, ids), eq(uploadIntents.photographerId, photographer.id)),
          ),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
      );

      // IDs not found or not owned are simply omitted (no enumeration)
      return ok(
        intents.map((i) => ({
          uploadId: i.id,
          eventId: i.eventId,
          status: i.status,
          errorCode: i.errorCode,
          errorMessage: i.errorMessage,
          photoId: i.photoId,
          completedAt: i.completedAt ?? null,
          expiresAt: i.expiresAt,
        })),
      );
    })
      .orTee((e) => e.cause && console.error('[uploads/status]', e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // =========================================================================
  // POST /uploads/:uploadId/presign - Re-presign for retry (SAB-48)
  // =========================================================================
  .post(
    '/:uploadId/presign',
    requirePhotographer(),
    zValidator('param', repressignParamsSchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;
        const db = c.var.db();
        const { uploadId } = c.req.valid('param');

        // 1. Find intent and verify ownership (NOT_FOUND for both missing + not owned)
        const [intent] = yield* ResultAsync.fromPromise(
          db
            .select({
              id: uploadIntents.id,
              eventId: uploadIntents.eventId,
              status: uploadIntents.status,
              contentType: uploadIntents.contentType,
              contentLength: uploadIntents.contentLength,
            })
            .from(uploadIntents)
            .where(
              and(
                eq(uploadIntents.id, uploadId),
                eq(uploadIntents.photographerId, photographer.id),
              ),
            )
            .limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        if (!intent) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Upload not found' });
        }

        // 2. Check state machine - only allow re-presign for certain states
        if (
          !REPRESSIGN_ALLOWED_STATUSES.includes(
            intent.status as (typeof REPRESSIGN_ALLOWED_STATUSES)[number],
          )
        ) {
          return err<never, HandlerError>({
            code: 'CONFLICT',
            message: `Cannot re-presign: upload is ${intent.status}`,
          });
        }

        // 3. Verify event still valid (not expired)
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ expiresAt: activeEvents.expiresAt })
            .from(activeEvents)
            .where(eq(activeEvents.id, intent.eventId))
            .limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        if (!event || new Date(event.expiresAt) < new Date()) {
          return err<never, HandlerError>({ code: 'GONE', message: 'Event has expired' });
        }

        // 4. Generate NEW r2Key (rotating strategy - old key becomes orphan)
        const timestamp = Date.now();
        const newR2Key = `uploads/${intent.eventId}/${uploadId}-${timestamp}`;
        const newExpiresAt = new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000);

        // 5. Generate presigned URL
        const presignResult = yield* ResultAsync.fromPromise(
          generatePresignedPutUrl(
            c.env.CF_ACCOUNT_ID,
            c.env.R2_ACCESS_KEY_ID,
            c.env.R2_SECRET_ACCESS_KEY,
            {
              bucket: c.env.PHOTO_BUCKET_NAME,
              key: newR2Key,
              contentType: intent.contentType,
              contentLength: intent.contentLength ?? 20 * 1024 * 1024,
              expiresIn: PRESIGN_TTL_SECONDS,
            },
          ),
          (e): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate presigned URL',
            cause: e,
          }),
        );

        // 6. Update intent with new key, reset status and errors
        yield* ResultAsync.fromPromise(
          db
            .update(uploadIntents)
            .set({
              r2Key: newR2Key,
              status: 'pending',
              expiresAt: newExpiresAt.toISOString(),
              errorCode: null,
              errorMessage: null,
            })
            .where(eq(uploadIntents.id, uploadId)),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        return ok({
          uploadId,
          putUrl: presignResult.url,
          objectKey: newR2Key,
          expiresAt: newExpiresAt.toISOString(),
          requiredHeaders: {
            'Content-Type': intent.contentType,
            ...(intent.contentLength && { 'Content-Length': String(intent.contentLength) }),
            'If-None-Match': '*',
          },
        });
      })
        .orTee(
          (e) => e.cause && console.error(`[uploads/${c.req.param('uploadId')}/presign]`, e.cause),
        )
        .match(
          (data) => c.json({ data }),
          (e) => apiError(c, e),
        );
    },
  )

  // =========================================================================
  // GET /uploads/events/:eventId - List upload intents for event (FF-94)
  // =========================================================================
  .get(
    '/events/:eventId',
    requirePhotographer(),
    zValidator('param', listIntentsParamsSchema),
    zValidator('query', listIntentsQuerySchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;
        const db = c.var.db();
        const { eventId } = c.req.valid('param');
        const { cursor, limit } = c.req.valid('query');

        // Verify event ownership
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id })
            .from(activeEvents)
            .where(
              and(eq(activeEvents.id, eventId), eq(activeEvents.photographerId, photographer.id)),
            )
            .limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Fetch limit + 1 for cursor pagination
        const fetchLimit = limit + 1;

        const rows = yield* ResultAsync.fromPromise(
          db
            .select({
              id: uploadIntents.id,
              status: uploadIntents.status,
              contentType: uploadIntents.contentType,
              contentLength: uploadIntents.contentLength,
              source: uploadIntents.source,
              errorCode: uploadIntents.errorCode,
              errorMessage: uploadIntents.errorMessage,
              createdAt: uploadIntents.createdAt,
              completedAt: uploadIntents.completedAt,
              photoId: photos.id,
              photoR2Key: photos.r2Key,
              photoStatus: photos.status,
              photoFaceCount: photos.faceCount,
              photoFileSize: photos.fileSize,
            })
            .from(uploadIntents)
            .leftJoin(photos, eq(uploadIntents.photoId, photos.id))
            .where(
              and(
                eq(uploadIntents.eventId, eventId),
                eq(uploadIntents.photographerId, photographer.id),
                cursor ? lt(uploadIntents.createdAt, cursor) : undefined,
              ),
            )
            .orderBy(desc(uploadIntents.createdAt))
            .limit(fetchLimit),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        const hasMore = rows.length > limit;
        const items = hasMore ? rows.slice(0, limit) : rows;
        const nextCursor = hasMore ? new Date(items[limit - 1].createdAt).toISOString() : null;

        const data = items.map((row) => ({
          id: row.id,
          status: row.status,
          contentType: row.contentType,
          contentLength: row.contentLength,
          source: row.source,
          errorCode: row.errorCode,
          errorMessage: row.errorMessage,
          createdAt: new Date(row.createdAt).toISOString(),
          completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
          photo: row.photoId
            ? {
                id: row.photoId,
                thumbnailUrl: generateThumbnailUrl(c.env, row.photoR2Key!),
                status: row.photoStatus!,
                faceCount: row.photoFaceCount ?? 0,
                fileSize: row.photoFileSize ?? null,
              }
            : null,
        }));

        return ok({
          data,
          pagination: { nextCursor, hasMore },
        });
      })
        .orTee((e) => e.cause && console.error('[uploads/events] error:', e.cause))
        .match(
          (result) => c.json(result),
          (e) => apiError(c, e),
        );
    },
  );
