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
import { eq, and, gt, sql, inArray } from 'drizzle-orm';
import {
  events,
  creditLedger,
  uploadIntents,
} from '@sabaipics/db';
import { requirePhotographer, type PhotographerVariables } from '../middleware';
import type { Env } from '../types';
import { apiError, type HandlerError } from '../lib/error';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { generatePresignedPutUrl } from '../lib/r2/presign';

// =============================================================================
// Constants
// =============================================================================

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
] as const;

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
    .max(MAX_FILE_SIZE, `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024} MB`),
  filename: z.string().optional(),
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

// =============================================================================
// Route
// =============================================================================

export const uploadsRouter = new Hono<Env>()
  .post(
    '/presign',
    requirePhotographer(),
    zValidator('json', presignRequestSchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;
        const db = c.var.db();
        const { eventId, contentType, contentLength } = c.req.valid('json');

        // 1. Verify event exists, is owned by photographer, and not expired
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({
              id: events.id,
              photographerId: events.photographerId,
              expiresAt: events.expiresAt,
            })
            .from(events)
            .where(eq(events.id, eventId))
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
        const [balanceCheck] = yield* ResultAsync.fromPromise(
          db
            .select({ balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int` })
            .from(creditLedger)
            .where(
              and(
                eq(creditLedger.photographerId, photographer.id),
                gt(creditLedger.expiresAt, sql`NOW()`),
              ),
            ),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        if ((balanceCheck?.balance ?? 0) < 1) {
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
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to generate upload URL', cause: e }),
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
              status: 'pending',
              expiresAt: presignResult.expiresAt.toISOString(),
            })
            .returning(),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        // 6. Return presigned URL details
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
    },
  )

  // =========================================================================
  // GET /uploads/status - Poll upload intent status (SAB-47)
  // =========================================================================
  .get(
    '/status',
    requirePhotographer(),
    zValidator('query', statusQuerySchema),
    async (c) => {
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
              uploadedAt: uploadIntents.uploadedAt,
              completedAt: uploadIntents.completedAt,
              expiresAt: uploadIntents.expiresAt,
            })
            .from(uploadIntents)
            .where(
              and(
                inArray(uploadIntents.id, ids),
                eq(uploadIntents.photographerId, photographer.id),
              ),
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
            uploadedAt: i.uploadedAt ?? null,
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
    },
  )

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
              and(eq(uploadIntents.id, uploadId), eq(uploadIntents.photographerId, photographer.id)),
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
            .select({ expiresAt: events.expiresAt })
            .from(events)
            .where(eq(events.id, intent.eventId))
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
          generatePresignedPutUrl(c.env.CF_ACCOUNT_ID, c.env.R2_ACCESS_KEY_ID, c.env.R2_SECRET_ACCESS_KEY, {
            bucket: c.env.PHOTO_BUCKET_NAME,
            key: newR2Key,
            contentType: intent.contentType,
            contentLength: intent.contentLength,
            expiresIn: PRESIGN_TTL_SECONDS,
          }),
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
            'Content-Length': String(intent.contentLength),
            'If-None-Match': '*',
          },
        });
      })
        .orTee((e) =>
          e.cause && console.error(`[uploads/${c.req.param('uploadId')}/presign]`, e.cause),
        )
        .match(
          (data) => c.json({ data }),
          (e) => apiError(c, e),
        );
    },
  );
