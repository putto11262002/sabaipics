import { Hono } from 'hono';
import { sql, eq, desc } from 'drizzle-orm';
import { events, photos } from '@/db';
import { requirePhotographer } from '../../middleware';
import type { Env } from '../../types';
import type { DashboardEvent, DashboardResponse } from './types';
import { apiError, type HandlerError } from '../../lib/error';
import { ResultAsync, safeTry, ok } from 'neverthrow';
import { getBalance, getNextExpiry } from '../../lib/credits';

// =============================================================================
// Routes
// =============================================================================

export const dashboardRouter = new Hono<Env>()
  // GET / - Dashboard data for authenticated photographer
  .get('/', requirePhotographer(), async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.db();

    return safeTry(async function* () {
      // Query 1: Credit balance (sum of unexpired credits)
      const creditBalance = yield* getBalance(db, photographer.id).mapErr(
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Database error',
          cause: e.cause,
        }),
      );

      // Query 2: Nearest expiry (earliest expiry from purchase rows)
      const nearestExpiry = yield* getNextExpiry(db, photographer.id).mapErr(
        (e): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Database error',
          cause: e.cause,
        }),
      );

      // Query 3: Total stats across ALL events (not limited)
      const [statsResult] = yield* ResultAsync.fromPromise(
        db
          .select({
            totalPhotos: sql<number>`COALESCE((
              SELECT COUNT(*)::int FROM ${photos}
              WHERE ${photos.eventId} IN (
                SELECT ${events.id} FROM ${events} WHERE ${events.photographerId} = ${photographer.id}
              )
            ), 0)`,
            totalFaces: sql<number>`COALESCE((
              SELECT SUM(${photos.faceCount})::int FROM ${photos}
              WHERE ${photos.eventId} IN (
                SELECT ${events.id} FROM ${events} WHERE ${events.photographerId} = ${photographer.id}
              )
            ), 0)`,
          })
          .from(events)
          .where(eq(events.photographerId, photographer.id))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      // Query 4: Events with photo/face counts (limited to 10 most recent)
      const eventsWithCounts = yield* ResultAsync.fromPromise(
        db
          .select({
            id: events.id,
            name: events.name,
            createdAt: events.createdAt,
            expiresAt: events.expiresAt,
            startDate: events.startDate,
            endDate: events.endDate,
            photoCount: sql<number>`COALESCE((
              SELECT COUNT(*)::int FROM ${photos} WHERE ${photos.eventId} = ${events.id}
            ), 0)`,
            faceCount: sql<number>`COALESCE((
              SELECT SUM(${photos.faceCount})::int FROM ${photos} WHERE ${photos.eventId} = ${events.id}
            ), 0)`,
          })
          .from(events)
          .where(eq(events.photographerId, photographer.id))
          .orderBy(desc(events.createdAt))
          .limit(10),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      // Format events for response
      const formattedEvents: DashboardEvent[] = eventsWithCounts.map((e) => ({
        id: e.id,
        name: e.name,
        photoCount: e.photoCount ?? 0,
        faceCount: e.faceCount ?? 0,
        createdAt: e.createdAt,
        expiresAt: e.expiresAt,
        startDate: e.startDate,
        endDate: e.endDate,
      }));

      const response: DashboardResponse = {
        credits: {
          balance: creditBalance,
          nearestExpiry: nearestExpiry,
        },
        events: formattedEvents,
        stats: {
          totalPhotos: statsResult?.totalPhotos ?? 0,
          totalFaces: statsResult?.totalFaces ?? 0,
        },
      };

      return ok(response);
    })
      .orTee((e) => e.cause && console.error('[Dashboard]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  });
