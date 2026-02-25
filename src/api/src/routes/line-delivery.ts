/**
 * LINE Delivery Dashboard Routes
 *
 * Authenticated endpoints for photographers to view LINE delivery
 * stats, history, and manage settings.
 *
 * Routes:
 * - GET  /line-delivery/stats     — Monthly usage & stats
 * - GET  /line-delivery/history   — Paginated delivery history
 * - GET  /line-delivery/settings  — Current LINE delivery settings
 * - PUT  /line-delivery/settings  — Update LINE delivery settings
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { lineDeliveries, photographers, events } from '@/db';
import { requirePhotographer } from '../middleware';
import type { Env } from '../types';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { safeHandler } from '../lib/safe-handler';
import { apiError, type HandlerError } from '../lib/error';
import { getMonthlyUsage } from '../lib/line/allowance';
import { getLineDeliveryCreditsSpent } from '../lib/credits';
import type { PhotographerSettings } from '@/db/schema/photographers';

// =============================================================================
// Schemas
// =============================================================================

const settingsSchema = z.object({
  photoCap: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.null()]),
  overageEnabled: z.boolean(),
});

// =============================================================================
// Router
// =============================================================================

export const lineDeliveryRouter = new Hono<Env>()
  // =========================================================================
  // GET /line-delivery/stats — Monthly usage and stats
  // =========================================================================
  .get('/stats', requirePhotographer(), async (c) => {
    return safeHandler(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();

      // Monthly allowance
      const allowance = yield* getMonthlyUsage(db, photographer.id).mapErr(
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e.cause }),
      );

      // Monthly delivery stats
      const startOfMonth = new Date();
      startOfMonth.setUTCDate(1);
      startOfMonth.setUTCHours(0, 0, 0, 0);

      const [monthStats] = yield* ResultAsync.fromPromise(
        db
          .select({
            deliveryCount: sql<number>`count(*)::int`,
            photoCount: sql<number>`coalesce(sum(${lineDeliveries.photoCount}), 0)::int`,
            messageCount: sql<number>`coalesce(sum(${lineDeliveries.messageCount}), 0)::int`,
          })
          .from(lineDeliveries)
          .where(
            and(
              eq(lineDeliveries.photographerId, photographer.id),
              gte(lineDeliveries.createdAt, startOfMonth.toISOString()),
            ),
          ),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const creditsSpent = yield* getLineDeliveryCreditsSpent(
        db,
        photographer.id,
        startOfMonth.toISOString(),
      ).mapErr(
        (e): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause: e.cause }),
      );

      return ok({
        allowance,
        month: {
          deliveryCount: monthStats?.deliveryCount ?? 0,
          photoCount: monthStats?.photoCount ?? 0,
          messageCount: monthStats?.messageCount ?? 0,
          creditsSpent,
        },
      });
    }, c);
  })

  // =========================================================================
  // GET /line-delivery/history — Paginated delivery history
  // =========================================================================
  .get('/history', requirePhotographer(), zValidator('query', z.object({
    page: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })), async (c) => {
    return safeHandler(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();

      const { page, limit } = c.req.valid('query');
      const offset = page * limit;

      const [rows, [countRow]] = yield* ResultAsync.fromPromise(
        Promise.all([
          db
            .select({
              id: lineDeliveries.id,
              eventName: events.name,
              lineUserId: lineDeliveries.lineUserId,
              photoCount: lineDeliveries.photoCount,
              messageCount: lineDeliveries.messageCount,
              creditCharged: lineDeliveries.creditCharged,
              status: lineDeliveries.status,
              createdAt: lineDeliveries.createdAt,
            })
            .from(lineDeliveries)
            .leftJoin(events, eq(lineDeliveries.eventId, events.id))
            .where(eq(lineDeliveries.photographerId, photographer.id))
            .orderBy(desc(lineDeliveries.createdAt))
            .limit(limit)
            .offset(offset),
          db
            .select({ total: sql<number>`count(*)::int` })
            .from(lineDeliveries)
            .where(eq(lineDeliveries.photographerId, photographer.id)),
        ]),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({
        entries: rows,
        total: countRow?.total ?? 0,
        page,
        limit,
      });
    }, c);
  })

  // =========================================================================
  // GET /line-delivery/settings — Current LINE delivery settings
  // =========================================================================
  .get('/settings', requirePhotographer(), async (c) => {
    return safeHandler(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();

      const [row] = yield* ResultAsync.fromPromise(
        db
          .select({ settings: photographers.settings })
          .from(photographers)
          .where(eq(photographers.id, photographer.id))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const lineSettings = (row?.settings as PhotographerSettings | null)?.lineSettings;

      return ok({
        photoCap: lineSettings?.photoCap ?? null,
        overageEnabled: lineSettings?.overageEnabled ?? false,
      });
    }, c);
  })

  // =========================================================================
  // PUT /line-delivery/settings — Update LINE delivery settings
  // =========================================================================
  .put('/settings', requirePhotographer(), zValidator('json', settingsSchema), async (c) => {
    return safeHandler(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const body = c.req.valid('json');

      // Read current settings to merge
      const [row] = yield* ResultAsync.fromPromise(
        db
          .select({ settings: photographers.settings })
          .from(photographers)
          .where(eq(photographers.id, photographer.id))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const currentSettings = (row?.settings as PhotographerSettings | null) ?? {};
      const updatedSettings: PhotographerSettings = {
        ...currentSettings,
        lineSettings: {
          photoCap: body.photoCap,
          overageEnabled: body.overageEnabled,
        },
      };

      yield* ResultAsync.fromPromise(
        db
          .update(photographers)
          .set({ settings: updatedSettings })
          .where(eq(photographers.id, photographer.id)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({
        photoCap: body.photoCap,
        overageEnabled: body.overageEnabled,
      });
    }, c);
  });
