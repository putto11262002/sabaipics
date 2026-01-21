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
import { eq, and, gt, sql } from 'drizzle-orm';
import { AwsClient } from 'aws4fetch';
import {
  events,
  creditLedger,
  uploadIntents,
} from '@sabaipics/db';
import { requirePhotographer, type PhotographerVariables } from '../middleware';
import type { Env } from '../types';
import { apiError, type HandlerError } from '../lib/error';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';


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

// =============================================================================
// Presigned URL Generation (co-located)
// =============================================================================

interface PresignOptions {
  bucket: string;
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn: number; // seconds
}

interface PresignResult {
  url: string;
  expiresAt: Date;
}

/**
 * Generate a presigned PUT URL for R2.
 *
 * Signed headers:
 * - Content-Type: must match exactly
 * - Content-Length: must match exactly
 * - If-None-Match: * (prevent overwrite)
 */
async function generatePresignedPutUrl(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  options: PresignOptions,
): Promise<PresignResult> {
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const r2Url = `https://${accountId}.r2.cloudflarestorage.com`;
  const objectUrl = `${r2Url}/${options.bucket}/${options.key}`;

  // URL with expiry
  const urlWithExpiry = `${objectUrl}?X-Amz-Expires=${options.expiresIn}`;

  // Sign the request with required headers
  const signedRequest = await client.sign(
    new Request(urlWithExpiry, {
      method: 'PUT',
      headers: {
        'Content-Type': options.contentType,
        'Content-Length': options.contentLength.toString(),
        'If-None-Match': '*',
      },
    }),
    { aws: { signQuery: true } },
  );

  const expiresAt = new Date(Date.now() + options.expiresIn * 1000);

  return {
    url: signedRequest.url,
    expiresAt,
  };
}

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
  );
