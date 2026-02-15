import type { MiddlewareHandler, TypedResponse } from "hono";
import { AuthErrorResponse, createAuthError } from "@/auth/errors";
import type { Env } from "../types";

/**
 * Middleware that requires admin API key authentication.
 *
 * Checks X-Admin-API-Key header against ADMIN_API_KEY env binding.
 * This bypasses Clerk auth - admin endpoints use API key auth only.
 *
 * @returns 401 if API key is missing or invalid
 */
export function requireAdmin(): MiddlewareHandler<
  Env,
  string,
  {},
  TypedResponse<AuthErrorResponse, 401, "json">
> {
  return async (c, next) => {
    const apiKey = c.req.header("X-Admin-API-Key");

    if (!apiKey) {
      return c.json(
        createAuthError("UNAUTHENTICATED", "Admin API key required"),
        401,
      );
    }

    if (apiKey !== c.env.ADMIN_API_KEY) {
      return c.json(
        createAuthError("UNAUTHENTICATED", "Invalid admin API key"),
        401,
      );
    }

    return next();
  };
}
