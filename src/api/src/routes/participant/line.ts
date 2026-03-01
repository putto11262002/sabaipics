/**
 * Participant LINE Routes
 *
 * Public endpoints for LINE Login OAuth flow and photo delivery.
 * No authentication required — these are for event participants.
 *
 * Routes:
 * - GET  /participant/line/auth?eventId=...&searchId=...     — Build LINE Login auth URL
 * - GET  /participant/line/callback?code=...&state=...       — Handle OAuth callback
 * - POST /participant/line/deliver                           — Deliver photos via LINE
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { safeTry, ok, err, okAsync, ResultAsync } from 'neverthrow';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';
import { signState, verifyState } from '../../lib/oauth-state';
import {
  buildLineLoginUrl,
  exchangeCodeForToken,
  verifyIdToken,
  checkFriendship,
} from '../../lib/line/login';
import { deliverPhotosViaLine, type DeliveryError } from '../../lib/line/delivery';
import { createLineClient } from '../../lib/line/client';
import { getMonthlyUsage } from '../../lib/line/allowance';
import { getBalance } from '../../lib/credits';
import { events, photographers, lineDeliveries } from '@/db';
import { eq } from 'drizzle-orm';
import type { PhotographerSettings } from '@/db/schema/photographers';
import { capturePostHogEvent } from '../../lib/posthog';

// =============================================================================
// KV Storage Helpers
// =============================================================================

const KV_TTL_SECONDS = 600; // 10 minutes

interface PendingLineDelivery {
  photoIds: string[];
  eventId: string;
  photographerId: string;
  createdAt: string;
}

function kvKey(searchId: string): string {
  return `line_pending:${searchId}`;
}

async function storePendingDelivery(
  kv: KVNamespace,
  searchId: string,
  data: PendingLineDelivery,
): Promise<void> {
  await kv.put(kvKey(searchId), JSON.stringify(data), {
    expirationTtl: KV_TTL_SECONDS,
  });
}

async function getPendingDelivery(
  kv: KVNamespace,
  searchId: string,
): Promise<PendingLineDelivery | null> {
  const value = await kv.get(kvKey(searchId));
  if (!value) return null;
  try {
    return JSON.parse(value) as PendingLineDelivery;
  } catch {
    return null;
  }
}

async function deletePendingDelivery(kv: KVNamespace, searchId: string): Promise<void> {
  await kv.delete(kvKey(searchId));
}

// =============================================================================
// Friendship Check Helper
// =============================================================================

interface FriendshipCheckError {
  message: string;
  cause?: unknown;
}

function checkFriendshipViaMessagingApi(
  lineClient: ReturnType<typeof createLineClient>,
  lineUserId: string,
): ResultAsync<boolean, FriendshipCheckError> {
  return ResultAsync.fromPromise(
    lineClient.getProfile(lineUserId),
    (e): FriendshipCheckError => ({
      message: 'Failed to check friendship status',
      cause: e,
    }),
  ).andThen((profile) => {
    // If we can get the profile, they're a friend
    return okAsync(!!profile);
  }).orElse(() => {
    // If we can't get the profile, they're not a friend
    return okAsync(false);
  });
}

// =============================================================================
// Database Error Helpers
// =============================================================================

interface DatabaseError {
  code?: string;
  constraint?: string;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  const dbErr = err as DatabaseError;
  return dbErr?.code === '23505'; // PostgreSQL unique violation
}

// =============================================================================
// Schemas
// =============================================================================

const authQuerySchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
  searchId: z.string().uuid('Invalid search ID format'),
});

const callbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code required'),
  state: z.string().min(1, 'State parameter required'),
  friendship_status_changed: z.string().optional(),
});

const pendingBodySchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
  searchId: z.string().uuid('Invalid search ID format'),
  photoIds: z.array(z.string().uuid()).min(1, 'At least one photo ID required'),
});

const friendshipQuerySchema = z.object({
  lineUserId: z.string().min(1, 'LINE user ID required'),
});

const deliverBodySchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
  searchId: z.string().uuid('Invalid search ID format'),
  lineUserId: z.string().min(1, 'LINE user ID required'),
});

// =============================================================================
// Error Mapping
// =============================================================================

function mapDeliveryError(e: DeliveryError): HandlerError {
  switch (e.type) {
    case 'not_found':
      return { code: 'NOT_FOUND', message: `${e.resource} not found` };
    case 'no_pending_delivery':
      return { code: 'NOT_FOUND', message: 'Your session has expired. Please start the LINE delivery flow again.' };
    case 'already_delivered':
      return { code: 'CONFLICT', message: `Photos already delivered (${e.existing.photoCount} photos)` };
    case 'no_friendship':
      return { code: 'BAD_REQUEST', message: 'Please add our LINE Official Account as a friend first' };
    case 'overage_disabled':
      return { code: 'PAYMENT_REQUIRED', message: 'Monthly LINE message limit reached. Photographer has not enabled overage billing.' };
    case 'insufficient_credits':
      return { code: 'PAYMENT_REQUIRED', message: 'Photographer has insufficient credits for overage messages' };
    case 'rate_limited':
      return { code: 'RATE_LIMITED', message: 'LINE API rate limit reached. Please try again later.', headers: { 'Retry-After': '60' } };
    case 'line_api':
      return { code: 'BAD_GATEWAY', message: 'Failed to send LINE messages', cause: e.cause };
    case 'database':
      return { code: 'INTERNAL_ERROR', message: 'Database error', cause: e.cause };
  }
}

// =============================================================================
// Router
// =============================================================================

const statusQuerySchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
});

export const lineParticipantRouter = new Hono<Env>()
  // =========================================================================
  // GET /participant/line/status — Check if LINE delivery is available
  // =========================================================================
  .get('/status', zValidator('query', statusQuerySchema), async (c) => {
    const { eventId } = c.req.valid('query');

    return safeTry(async function* () {
      const db = c.var.db();

      // Look up event → photographerId
      const [event] = await db
        .select({ photographerId: events.photographerId })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      // Look up photographer settings
      const [photographer] = await db
        .select({
          settings: photographers.settings,
        })
        .from(photographers)
        .where(eq(photographers.id, event.photographerId))
        .limit(1);

      const balance = yield* getBalance(db, event.photographerId).mapErr(
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e.cause }),
      );

      const lineSettings = (photographer?.settings as PhotographerSettings | null)?.lineSettings;
      const overageEnabled = lineSettings?.overageEnabled ?? false;

      // Check monthly allowance
      const usage = yield* getMonthlyUsage(db, event.photographerId).mapErr(
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e.cause }),
      );

      // Determine availability
      let available = true;
      if (usage.remaining <= 0) {
        if (!overageEnabled) {
          available = false;
        } else if (balance <= 0) {
          available = false;
        }
      }

      return ok({ available });
    })
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // =========================================================================
  // GET /participant/line/auth — Build LINE Login authorization URL
  // =========================================================================
  .get('/auth', zValidator('query', authQuerySchema), async (c) => {
    const { eventId, searchId } = c.req.valid('query');

    // Sign state with HMAC to prevent tampering
    const payload = JSON.stringify({ eventId, searchId });
    const stateData = await signState(payload, c.env.LINE_LOGIN_CHANNEL_SECRET);
    const state = btoa(JSON.stringify(stateData));
    const redirectUri = `${c.env.API_BASE_URL}/participant/line/callback`;

    const authUrl = buildLineLoginUrl({
      channelId: c.env.LINE_LOGIN_CHANNEL_ID,
      redirectUri,
      state,
    });

    return c.json({ data: { authUrl } });
  })

  // =========================================================================
  // GET /participant/line/callback — Handle LINE Login OAuth callback
  // =========================================================================
  .get('/callback', zValidator('query', callbackQuerySchema), async (c) => {
    return safeTry(async function* () {
      const { code, state } = c.req.valid('query');

      // Decode and verify signed state
      let parsedState: { eventId: string; searchId: string };
      try {
        const stateData = JSON.parse(atob(state)) as Awaited<ReturnType<typeof signState>>;
        const payload = await verifyState(stateData, c.env.LINE_LOGIN_CHANNEL_SECRET);
        if (!payload) {
          return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'Invalid or expired state parameter' });
        }
        parsedState = JSON.parse(payload);
      } catch {
        return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'Invalid state parameter' });
      }

      const { eventId, searchId } = parsedState;
      const redirectUri = `${c.env.API_BASE_URL}/participant/line/callback`;

      // Exchange code for tokens
      const tokens = yield* exchangeCodeForToken({
        code,
        redirectUri,
        channelId: c.env.LINE_LOGIN_CHANNEL_ID,
        channelSecret: c.env.LINE_LOGIN_CHANNEL_SECRET,
      }).mapErr((e): HandlerError => ({
        code: 'BAD_GATEWAY',
        message: e.message,
        cause: e.cause,
      }));

      // Verify ID token → extract userId
      const idPayload = yield* verifyIdToken(
        tokens.id_token,
        c.env.LINE_LOGIN_CHANNEL_ID,
      ).mapErr((e): HandlerError => ({
        code: 'BAD_GATEWAY',
        message: e.message,
        cause: e.cause,
      }));

      const lineUserId = idPayload.sub;

      // Check friendship
      const isFriend = yield* checkFriendship(tokens.access_token).mapErr(
        (e): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: e.message,
          cause: e.cause,
        }),
      );

      // Redirect back to event app
      const eventAppUrl = c.env.EVENT_FRONTEND_URL;
      const params = new URLSearchParams({
        lineUserId,
        searchId,
        status: isFriend ? 'ok' : 'not_friend',
      });

      return ok(`${eventAppUrl}/${eventId}/line-callback?${params.toString()}`);
    })
      .orTee((e) => e.cause && console.error('[LINE callback]', e.code, e.cause))
      .match(
        (redirectUrl) => c.redirect(redirectUrl, 302),
        (e) => {
          // On error, redirect to event app with error status
          // Try to extract eventId from state for redirect
          try {
            const { state } = c.req.valid('query');
            const { eventId } = JSON.parse(atob(state));
            const eventAppUrl = c.env.EVENT_FRONTEND_URL;
            return c.redirect(
              `${eventAppUrl}/${eventId}/line-callback?status=error&message=${encodeURIComponent(e.message)}`,
              302,
            );
          } catch {
            return apiError(c, e);
          }
        },
      );
  })

  // =========================================================================
  // POST /participant/line/pending — Store photo selection in KV before OAuth
  // =========================================================================
  .post('/pending', zValidator('json', pendingBodySchema), async (c) => {
    const { eventId, searchId, photoIds } = c.req.valid('json');

    return safeTry(async function* () {
      const db = c.var.db();
      const kv = c.env.LINE_PENDING_KV;

      // Look up event → photographerId
      const eventRows = yield* ResultAsync.fromPromise(
        db.select({ photographerId: events.photographerId })
          .from(events)
          .where(eq(events.id, eventId))
          .limit(1),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e }),
      ).andThen((rows) =>
        rows[0]
          ? ok(rows[0])
          : err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' }),
      );

      // Store in KV (not database - we don't have lineUserId yet)
      await storePendingDelivery(kv, searchId, {
        photoIds,
        eventId,
        photographerId: eventRows.photographerId,
        createdAt: new Date().toISOString(),
      });

      return ok({ success: true });
    })
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // =========================================================================
  // GET /participant/line/friendship — Check friendship status (for polling)
  // =========================================================================
  .get('/friendship', zValidator('query', friendshipQuerySchema), async (c) => {
    const { lineUserId } = c.req.valid('query');

    return safeTry(async function* () {
      // Use Messaging API to check if user is following
      const lineClient = createLineClient({
        LINE_CHANNEL_ACCESS_TOKEN: c.env.LINE_CHANNEL_ACCESS_TOKEN,
      });

      try {
        // Try to get the user's profile via Messaging API
        // This will fail if not friends
        const profile = await lineClient.getProfile(lineUserId);
        return ok({ isFriend: true, displayName: profile.displayName });
      } catch {
        // If we can't get profile, they're not a friend
        return ok({ isFriend: false });
      }
    })
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // =========================================================================
  // POST /participant/line/deliver — Push photos via LINE
  // =========================================================================
  .post('/deliver', zValidator('json', deliverBodySchema), async (c) => {
    const { eventId, searchId, lineUserId } = c.req.valid('json');

    return safeTry(async function* () {
      const db = c.var.db();
      const kv = c.env.LINE_PENDING_KV;
      const lineClient = createLineClient({
        LINE_CHANNEL_ACCESS_TOKEN: c.env.LINE_CHANNEL_ACCESS_TOKEN,
      });

      // Get photoIds from KV
      const pending = yield* ResultAsync.fromPromise(
        getPendingDelivery(kv, searchId),
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'KV error', cause: e }),
      ).andThen((data) =>
        data?.photoIds && data.photoIds.length > 0
          ? ok(data)
          : err<never, HandlerError>({
              code: 'NOT_FOUND',
              message: 'Your session has expired. Please start the LINE delivery flow again.',
            }),
      );

      const { photoIds, photographerId } = pending;

      // Verify friendship before attempting delivery
      const isFriend = yield* checkFriendshipViaMessagingApi(lineClient, lineUserId).mapErr(
        (e): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: e.message,
          cause: e.cause,
        }),
      );

      if (!isFriend) {
        return ok({
          status: 'partial' as const,
          photoCount: 0,
          messageCount: 0,
          creditCharged: false,
        });
      }

      // Check for existing successful delivery (idempotency)
      const [existingDelivery] = await db
        .select({
          status: lineDeliveries.status,
          photoCount: lineDeliveries.photoCount,
          messageCount: lineDeliveries.messageCount,
        })
        .from(lineDeliveries)
        .where(
          eq(lineDeliveries.searchId, searchId),
        )
        .limit(1);

      if (existingDelivery?.status === 'sent') {
        return ok({
          status: 'sent' as const,
          photoCount: existingDelivery.photoCount,
          messageCount: existingDelivery.messageCount,
          creditCharged: false,
        });
      }

      // Create delivery record with pending status
      // Handle race condition: if another request created a delivery for this searchId,
      // re-query and return the existing result
      let deliveryId: string;
      try {
        const [deliveryRecord] = await db
          .insert(lineDeliveries)
          .values({
            photographerId,
            eventId,
            searchId,
            photoIds,
            lineUserId,
            status: 'pending',
            messageCount: 0,
            photoCount: 0,
            creditCharged: false,
          })
          .returning({ id: lineDeliveries.id });
        deliveryId = deliveryRecord.id;
      } catch (dbError: unknown) {
        // Check for unique constraint violation (race condition)
        if (isUniqueConstraintViolation(dbError)) {
          // Re-query to get the existing delivery
          const [raceDelivery] = await db
            .select({
              id: lineDeliveries.id,
              status: lineDeliveries.status,
              photoCount: lineDeliveries.photoCount,
              messageCount: lineDeliveries.messageCount,
            })
            .from(lineDeliveries)
            .where(eq(lineDeliveries.searchId, searchId))
            .limit(1);

          if (raceDelivery?.status === 'sent') {
            return ok({
              status: 'sent' as const,
              photoCount: raceDelivery.photoCount,
              messageCount: raceDelivery.messageCount,
              creditCharged: false,
            });
          }

          // If still pending, another request is processing - return error
          return err<never, HandlerError>({
            code: 'CONFLICT',
            message: 'Another delivery request is in progress. Please wait.',
          });
        }
        throw dbError;
      }

      const result = yield* deliverPhotosViaLine({
        searchId,
        photoIds,
        lineUserId,
        deliveryId,
        db: c.var.db(),
        dbTx: c.var.dbTx(),
        lineClient,
        r2BaseUrl: c.env.PHOTO_R2_BASE_URL,
        cfZone: c.env.CF_ZONE,
        isDev: c.env.NODE_ENV === 'development',
      }).mapErr(mapDeliveryError);

      // Clean up KV entry after successful delivery
      c.executionCtx.waitUntil(deletePendingDelivery(kv, searchId));

      c.executionCtx.waitUntil(
        capturePostHogEvent(c.env.POSTHOG_API_KEY, {
          distinctId: `line_${lineUserId}`,
          event: 'photos_delivered',
          properties: {
            event_id: eventId,
            delivery_method: 'line',
            photo_count: result.photoCount,
            message_count: result.messageCount,
            status: result.status,
          },
        }),
      );

      return ok(result);
    })
      .orTee((e) => e.cause && console.error('[LINE deliver]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  });
