import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { creditPackages } from "@sabaipics/db";
import type { Env } from "../types";

/**
 * Public credit packages API
 * No authentication required - accessible to all users
 */
export const creditsRouter = new Hono<Env>()
  /**
   * GET /credit-packages
   *
   * Returns all active credit packages sorted by sortOrder.
   * Public endpoint - no authentication required.
   */
  .get("/", async (c) => {
    const db = c.var.db();

    const packages = await db
      .select({
        id: creditPackages.id,
        name: creditPackages.name,
        credits: creditPackages.credits,
        priceThb: creditPackages.priceThb,
      })
      .from(creditPackages)
      .where(eq(creditPackages.active, true))
      .orderBy(asc(creditPackages.sortOrder));

    return c.json({ data: packages });
  });
