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
import { safeTry, ok, err } from 'neverthrow';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';
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
import { events, photographers } from '@/db';
import { eq } from 'drizzle-orm';
import type { PhotographerSettings } from '@/db/schema/photographers';
import { capturePostHogEvent } from '../../lib/posthog';

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

    const state = btoa(JSON.stringify({ eventId, searchId }));
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

      // Decode state
      let parsedState: { eventId: string; searchId: string };
      try {
        parsedState = JSON.parse(atob(state));
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
  // POST /participant/line/deliver — Push photos via LINE
  // =========================================================================
  .post('/deliver', zValidator('json', deliverBodySchema), async (c) => {
    const { eventId, searchId, lineUserId } = c.req.valid('json');

    return safeTry(async function* () {
      const lineClient = createLineClient({
        LINE_CHANNEL_ACCESS_TOKEN: c.env.LINE_CHANNEL_ACCESS_TOKEN,
      });

      const result = yield* deliverPhotosViaLine({
        searchId,
        lineUserId,
        db: c.var.db(),
        dbTx: c.var.dbTx(),
        lineClient,
        r2BaseUrl: c.env.PHOTO_R2_BASE_URL,
        cfZone: c.env.CF_ZONE,
        isDev: c.env.NODE_ENV === 'development',
      }).mapErr(mapDeliveryError);

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
