import { Hono } from "hono";
import { sql, eq, gt, and, desc } from "drizzle-orm";
import { creditLedger, events, photos } from "@sabaipics/db";
import {
  requirePhotographer,
  requireConsent,
  type PhotographerVariables,
} from "../middleware";
import type { Bindings } from "../types";

// =============================================================================
// Types
// =============================================================================

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

type DashboardEvent = {
  id: string;
  name: string;
  photoCount: number;
  faceCount: number;
  createdAt: string;
  expiresAt: string;
  startDate: string | null;
  endDate: string | null;
};

type DashboardResponse = {
  credits: {
    balance: number;
    nearestExpiry: string | null;
  };
  events: DashboardEvent[];
  stats: {
    totalPhotos: number;
    totalFaces: number;
  };
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

    // Query 3: Events with photo/face counts using subqueries
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
      .orderBy(desc(events.createdAt));

    // Compute total stats from events data
    const totalPhotos = eventsWithCounts.reduce(
      (sum, e) => sum + (e.photoCount ?? 0),
      0
    );
    const totalFaces = eventsWithCounts.reduce(
      (sum, e) => sum + (e.faceCount ?? 0),
      0
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
        balance: balanceResult?.balance ?? 0,
        nearestExpiry: expiryResult?.nearestExpiry ?? null,
      },
      events: formattedEvents,
      stats: {
        totalPhotos,
        totalFaces,
      },
    };

    return c.json({ data: response });
  });
