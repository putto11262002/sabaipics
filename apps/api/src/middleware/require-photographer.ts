import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { photographers } from "@sabaipics/db/schema";
import { createAuthError } from "@sabaipics/auth/errors";
import type { AuthVariables } from "@sabaipics/auth/types";
import { getDb } from "../lib/db";

/**
 * Minimal photographer context stored in request
 * Contains only fields needed by most routes
 */
export type PhotographerContext = {
  id: string;
  pdpaConsentAt: string | null;
};

/**
 * Extended variables including photographer context
 * Use this type for routes that require photographer auth
 */
export type PhotographerVariables = AuthVariables & {
  photographer: PhotographerContext;
};

type Env = {
  Bindings: { DATABASE_URL: string };
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

    const db = getDb(c);
    const [row] = await db
      .select({
        id: photographers.id,
        pdpaConsentAt: photographers.pdpaConsentAt,
      })
      .from(photographers)
      .where(eq(photographers.clerkId, auth.userId))
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
