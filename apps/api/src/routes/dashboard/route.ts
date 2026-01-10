import { Hono } from "hono";
import { sql, eq, gt, and, desc } from "drizzle-orm";
import { creditLedger, events, photos } from "@sabaipics/db";
import {
  requirePhotographer,
  requireConsent,
  type PhotographerVariables,
} from "../../middleware";
import type { Bindings } from "../../types";
import type { DashboardEvent, DashboardResponse } from "./types";

// =============================================================================
// Types
// =============================================================================

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

// =============================================================================
// Routes
// =============================================================================

export const dashboardRouter = new Hono<Env>()
  // GET / - Dashboard data for authenticated photographer
  .get("/", requirePhotographer(), requireConsent(), async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.db();

    // Query 1: Credit balance (sum of unexpired credits)
    const [balanceResult] = await db
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

    // Query 2: Nearest expiry (earliest expiry from purchase rows)
    const [expiryResult] = await db
      .select({
        nearestExpiry: sql<string | null>`MIN(${creditLedger.expiresAt})`,
      })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.photographerId, photographer.id),
          gt(creditLedger.amount, 0),
          gt(creditLedger.expiresAt, sql`NOW()`)
        )
      );

    // Query 3: Total stats across ALL events (not limited)
    const [statsResult] = await db
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
      .limit(1);

    // Query 4: Events with photo/face counts (limited to 10 most recent)
    const eventsWithCounts = await db
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
      .limit(10);

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
        balance: balanceResult?.balance ?? 0,
        nearestExpiry: expiryResult?.nearestExpiry ?? null,
      },
      events: formattedEvents,
      stats: {
        totalPhotos: statsResult?.totalPhotos ?? 0,
        totalFaces: statsResult?.totalFaces ?? 0,
      },
    };

    return c.json({ data: response });
  });
