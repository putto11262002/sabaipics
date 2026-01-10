import type { MiddlewareHandler } from "hono";
import { createAuthError } from "@sabaipics/auth/errors";

type Env = {
  Bindings: { ADMIN_API_KEY: string };
};

/**
 * Middleware that requires admin API key authentication.
 *
 * Checks X-Admin-API-Key header against ADMIN_API_KEY env binding.
 * This bypasses Clerk auth - admin endpoints use API key auth only.
 *
 * @returns 401 if API key is missing or invalid
 */
export function requireAdmin(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const apiKey = c.req.header("X-Admin-API-Key");

    if (!apiKey) {
      return c.json(
        createAuthError("UNAUTHENTICATED", "Admin API key required"),
        401
      );
    }

    if (apiKey !== c.env.ADMIN_API_KEY) {
      return c.json(
        createAuthError("UNAUTHENTICATED", "Invalid admin API key"),
        401
      );
    }

    return next();
  };
}
