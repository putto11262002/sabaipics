import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { activePhotographers, type Photographer, type Database } from "@/db";
import { createAuthError } from "@/auth/errors";
import type { AuthVariables } from "@/auth/types";

/**
 * Minimal photographer context stored in request
 * Contains only fields needed by most routes
 */
export type PhotographerContext = Pick<Photographer, "id" | "pdpaConsentAt">;

/**
 * Extended variables including photographer context
 * Use this type for routes that require photographer auth
 */
export type PhotographerVariables = AuthVariables & {
  db: () => Database;
  photographer: PhotographerContext;
};

type Env = {
  Variables: PhotographerVariables;
};

/**
 * Middleware that requires authenticated photographer
 *
 * Checks:
 * 1. Valid Clerk auth exists
 * 2. Photographer record exists in DB (by clerkId)
 *
 * Sets `photographer` in context with { id, pdpaConsentAt }
 *
 * @returns 401 if not authenticated
 * @returns 403 if photographer not found in DB
 */
export function requirePhotographer(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth) {
      return c.json(
        createAuthError("UNAUTHENTICATED", "Authentication required"),
        401
      );
    }

    const db = c.var.db();
    const [row] = await db
      .select({
        id: activePhotographers.id,
        pdpaConsentAt: activePhotographers.pdpaConsentAt,
      })
      .from(activePhotographers)
      .where(eq(activePhotographers.clerkId, auth.userId))
      .limit(1);

    if (!row) {
      return c.json(
        createAuthError("FORBIDDEN", "Photographer account not found"),
        403
      );
    }

    c.set("photographer", row);
    return next();
  };
}
