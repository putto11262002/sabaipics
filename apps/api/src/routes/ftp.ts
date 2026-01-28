/**
 * FTP Upload Support Routes
 *
 * - POST /api/ftp/auth: Authenticate FTP credentials, return JWT
 * - POST /api/ftp/presign: Generate presigned R2 URL for upload
 * - POST /events/:id/ftp-credentials: Create FTP credentials for event (Clerk auth)
 * - GET /events/:id/ftp-credentials: Get FTP credentials status (Clerk auth)
 * - DELETE /events/:id/ftp-credentials: Revoke FTP credentials (Clerk auth)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, gt, sql } from 'drizzle-orm';
import { ftpCredentials, events, creditLedger, photographers, uploadIntents } from '@sabaipics/db';
import { requirePhotographer, type PhotographerVariables } from '../middleware';
import type { Env } from '../types';
import { apiError, type HandlerError } from '../lib/error';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { generatePresignedPutUrl } from '../lib/r2/presign';
import { hashPassword, verifyPassword } from '../lib/password';
import { signFtpToken } from '../lib/ftp/jwt';
import { ALLOWED_MIME_TYPES } from '../lib/event/constants';

// =============================================================================
// Constants
// =============================================================================

const PRESIGN_TTL_SECONDS = 3600; // 1 hour

// =============================================================================
// Schemas
// =============================================================================

const ftpAuthRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const ftpPresignRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({ message: `Content type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` }),
  }),
  contentLength: z.number().int().positive().optional(),
});

const ftpCredentialsParamsSchema = z.object({
  id: z.string().uuid('Invalid event ID'),
});

// =============================================================================
// Router
// =============================================================================

export const ftpRouter = new Hono<Env>()
  .post('/auth', zValidator('json', ftpAuthRequestSchema), async (c) => {
    return safeTry(async function* () {
      const db = c.var.db();
      const { username, password } = c.req.valid('json');

      // 1. Look up FTP credentials by username
      const credentialRows: any = yield* ResultAsync.fromPromise(
        db
          .select({
            id: ftpCredentials.id,
            eventId: ftpCredentials.eventId,
            photographerId: ftpCredentials.photographerId,
            passwordHash: ftpCredentials.passwordHash,
            expiresAt: ftpCredentials.expiresAt,
            eventName: events.name,
            eventExpiresAt: events.expiresAt,
          })
          .from(ftpCredentials)
          .innerJoin(events, eq(ftpCredentials.eventId, events.id))
          .where(eq(ftpCredentials.username, username))
          .limit(1),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
      );

      const credential = credentialRows[0];
      if (!credential) {
        return err<never, HandlerError>({
          code: 'UNAUTHENTICATED',
          message: 'Invalid credentials',
        });
      }

      // 2. Verify password hash
      const passwordValid = yield* ResultAsync.fromThrowable(
        () => verifyPassword(credential.passwordHash, password),
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Authentication error',
          cause: e,
        }),
      )();

      if (!passwordValid) {
        return err<never, HandlerError>({
          code: 'UNAUTHENTICATED',
          message: 'Invalid credentials',
        });
      }

      // 3. Check credential expiry
      if (new Date(credential.expiresAt) < new Date()) {
        return err<never, HandlerError>({
          code: 'UNAUTHENTICATED',
          message: 'Credentials expired',
        });
      }

      // 4. Check event expiry
      if (new Date(credential.eventExpiresAt) < new Date()) {
        return err<never, HandlerError>({ code: 'GONE', message: 'Event has expired' });
      }

      // 5. Check credit balance (fail-fast, no lock)
      const balanceRows: any = yield* ResultAsync.fromPromise(
        db
          .select({ balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int` })
          .from(creditLedger)
          .where(
            and(
              eq(creditLedger.photographerId, credential.photographerId),
              gt(creditLedger.expiresAt, sql`NOW()`),
            ),
          ),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
      );

      const creditsRemaining = (balanceRows[0]?.balance ?? 0) as number;
      if (creditsRemaining < 1) {
        return err<never, HandlerError>({
          code: 'PAYMENT_REQUIRED',
          message: 'Insufficient credits',
        });
      }

      // 6. Sign JWT token
      const token = yield* ResultAsync.fromThrowable(
        () =>
          signFtpToken(c.env.FTP_JWT_SECRET, {
            eventId: credential.eventId,
            photographerId: credential.photographerId,
          }),
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Token generation failed',
          cause: e,
        }),
      )();

      // 7. Return auth response
      return ok({
        token,
        event_id: credential.eventId,
        event_name: credential.eventName,
        upload_window_end: credential.eventExpiresAt,
        credits_remaining: creditsRemaining,
      });
    })
      .orTee((e) => e.cause && console.error('[ftp/auth]', e.code + ':', e.cause))
      .match(
        (data) => c.json(data),
        (e) => apiError(c, e),
      );
  })
  .post(
    '/presign',
    async (c, next) => {
      // Import dynamically to avoid circular dependency issues
      const { requireFtpAuth } = await import('../middleware/ftp-auth');
      return requireFtpAuth()(c, next);
    },
    zValidator('json', ftpPresignRequestSchema),
    async (c) => {
      return safeTry(async function* () {
        const db = c.var.db();
        const ftpAuth = (c as any).get?.('ftpAuth') as any;

        if (!ftpAuth) {
          return err<never, HandlerError>({
            code: 'UNAUTHENTICATED',
            message: 'Not authenticated',
          });
        }

        const { filename, contentType, contentLength } = c.req.valid('json');

        // 1. Verify event still exists and is not expired
        const eventRows: any = yield* ResultAsync.fromPromise(
          db
            .select({
              id: events.id,
              expiresAt: events.expiresAt,
            })
            .from(events)
            .where(eq(events.id, ftpAuth.eventId))
            .limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        const event = eventRows[0];
        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        if (new Date(event.expiresAt) < new Date()) {
          return err<never, HandlerError>({ code: 'GONE', message: 'Event has expired' });
        }

        // 2. Check credit balance (fail-fast, no lock)
        const balanceRows: any = yield* ResultAsync.fromPromise(
          db
            .select({ balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int` })
            .from(creditLedger)
            .where(
              and(
                eq(creditLedger.photographerId, ftpAuth.photographerId),
                gt(creditLedger.expiresAt, sql`NOW()`),
              ),
            ),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        if (((balanceRows[0]?.balance ?? 0) as number) < 1) {
          return err<never, HandlerError>({
            code: 'PAYMENT_REQUIRED',
            message: 'Insufficient credits',
          });
        }

        // 3. Generate unique R2 key
        const uploadId = crypto.randomUUID();
        const timestamp = Date.now();
        const r2Key = `uploads/${ftpAuth.eventId}/${uploadId}-${timestamp}`;

        // 4. Generate presigned URL (contentLength is optional)
        const presignOptions: any = {
          bucket: c.env.PHOTO_BUCKET_NAME,
          key: r2Key,
          contentType,
          expiresIn: PRESIGN_TTL_SECONDS,
        };

        // Only include contentLength if provided
        if (contentLength !== undefined) {
          presignOptions.contentLength = contentLength;
        }

        const presignResult = yield* ResultAsync.fromPromise(
          generatePresignedPutUrl(
            c.env.CF_ACCOUNT_ID,
            c.env.R2_ACCESS_KEY_ID,
            c.env.R2_SECRET_ACCESS_KEY,
            presignOptions,
          ),
          (e): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate upload URL',
            cause: e,
          }),
        );

        // 5. Create upload intent record
        const intentRows: any = yield* ResultAsync.fromPromise(
          db
            .insert(uploadIntents)
            .values({
              id: uploadId,
              photographerId: ftpAuth.photographerId,
              eventId: ftpAuth.eventId,
              r2Key,
              contentType,
              contentLength: contentLength ?? null,
              status: 'pending',
              expiresAt: presignResult.expiresAt.toISOString(),
              source: 'ftp',
            })
            .returning(),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        const intent = intentRows[0];

        // 6. Return presigned URL response
        return ok({
          upload_id: intent.id,
          put_url: presignResult.url,
          object_key: r2Key,
          expires_at: presignResult.expiresAt.toISOString(),
          required_headers: {
            'Content-Type': contentType,
          },
        });
      })
        .orTee((e) => e.cause && console.error('[ftp/presign]', e.code + ':', e.cause))
        .match(
          (data) => c.json(data, 201),
          (e) => apiError(c, e),
        );
    },
  )
  .post(
    '/events/:id/ftp-credentials',
    requirePhotographer(),
    zValidator('param', ftpCredentialsParamsSchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;
        const db = c.var.db();
        const { id: eventId } = c.req.valid('param');

        // 1. Verify event exists and is owned by photographer
        const eventRows: any = yield* ResultAsync.fromPromise(
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

        const event = eventRows[0];
        if (!event || event.photographerId !== photographer.id) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // 2. Check if credentials already exist for this event
        const existingRows: any = yield* ResultAsync.fromPromise(
          db
            .select({ id: ftpCredentials.id })
            .from(ftpCredentials)
            .where(eq(ftpCredentials.eventId, eventId))
            .limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        if (existingRows.length > 0) {
          return err<never, HandlerError>({
            code: 'CONFLICT',
            message: 'FTP credentials already exist for this event',
          });
        }

        // 3. Generate username (auto-generated format: evt-{short-id})
        const shortId = crypto.randomUUID().slice(0, 8);
        const username = `evt-${shortId}`;

        // 4. Generate high-entropy password
        const password = crypto.randomUUID();

        // 5. Hash password
        const passwordHash = yield* ResultAsync.fromThrowable(
          () => hashPassword(password),
          (e): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Password hashing failed',
            cause: e,
          }),
        )();

        // 6. Create credential record
        const credentialRows: any = yield* ResultAsync.fromPromise(
          db
            .insert(ftpCredentials)
            .values({
              eventId,
              photographerId: photographer.id,
              username,
              passwordHash,
              expiresAt: event.expiresAt,
            })
            .returning(),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        const credential = credentialRows[0];

        // 7. Return credentials (password shown only once)
        return ok({
          id: credential.id,
          username,
          password,
          expiresAt: credential.expiresAt,
          createdAt: credential.createdAt,
        });
      })
        .orTee((e) => e.cause && console.error('[ftp-credentials/create]', e.code + ':', e.cause))
        .match(
          (data) => c.json(data, 201),
          (e) => apiError(c, e),
        );
    },
  )
  .get(
    '/events/:id/ftp-credentials',
    requirePhotographer(),
    zValidator('param', ftpCredentialsParamsSchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;
        const db = c.var.db();
        const { id: eventId } = c.req.valid('param');

        // 1. Verify event exists and is owned by photographer
        const eventRows: any = yield* ResultAsync.fromPromise(
          db
            .select({ id: events.id, photographerId: events.photographerId })
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        const event = eventRows[0];
        if (!event || event.photographerId !== photographer.id) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // 2. Get FTP credentials
        const credentialRows: any = yield* ResultAsync.fromPromise(
          db
            .select({
              id: ftpCredentials.id,
              username: ftpCredentials.username,
              expiresAt: ftpCredentials.expiresAt,
              createdAt: ftpCredentials.createdAt,
            })
            .from(ftpCredentials)
            .where(eq(ftpCredentials.eventId, eventId))
            .limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        const credential = credentialRows[0];
        if (!credential) {
          return err<never, HandlerError>({
            code: 'NOT_FOUND',
            message: 'FTP credentials not found',
          });
        }

        return ok({
          id: credential.id,
          username: credential.username,
          expiresAt: credential.expiresAt,
          createdAt: credential.createdAt,
        });
      })
        .orTee((e) => e.cause && console.error('[ftp-credentials/get]', e.code + ':', e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )
  .delete(
    '/events/:id/ftp-credentials',
    requirePhotographer(),
    zValidator('param', ftpCredentialsParamsSchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;
        const db = c.var.db();
        const { id: eventId } = c.req.valid('param');

        // 1. Verify event exists and is owned by photographer
        const eventRows: any = yield* ResultAsync.fromPromise(
          db
            .select({ id: events.id, photographerId: events.photographerId })
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        const event = eventRows[0];
        if (!event || event.photographerId !== photographer.id) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // 2. Delete FTP credentials
        const result: any = yield* ResultAsync.fromPromise(
          db
            .delete(ftpCredentials)
            .where(eq(ftpCredentials.eventId, eventId))
            .returning({ id: ftpCredentials.id }),
          (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
        );

        if (result.length === 0) {
          return err<never, HandlerError>({
            code: 'NOT_FOUND',
            message: 'FTP credentials not found',
          });
        }

        return ok({
          message: 'FTP credentials revoked',
        });
      })
        .orTee((e) => e.cause && console.error('[ftp-credentials/delete]', e.code + ':', e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  );
