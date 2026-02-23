import type { MiddlewareHandler, TypedResponse } from "hono";
import { AuthErrorResponse, createAuthError } from "@/auth/errors";
import { verifyCfAccessToken } from "../lib/cf-access/jwt";
import type { Env } from "../types";

/**
 * Middleware that requires Cloudflare Access JWT authentication.
 *
 * In production/staging, verifies the `Cf-Access-Jwt-Assertion` header
 * against the CF Access JWKS endpoint.
 *
 * In development, skips JWT verification (no CF Access locally).
 *
 * @returns 401 if JWT is missing or invalid
 */
export function requireAdmin(): MiddlewareHandler<
  Env,
  string,
  {},
  TypedResponse<AuthErrorResponse, 401, "json">
> {
  return async (c, next) => {
    // Dev bypass — no CF Access tunnel locally
    if (c.env.NODE_ENV === "development") {
      c.set("adminEmail", "dev@admin.local");
      return next();
    }

    const token = c.req.header("Cf-Access-Jwt-Assertion");

    if (!token) {
      return c.json(
        createAuthError("UNAUTHENTICATED", "CF Access token required"),
        401,
      );
    }

    try {
      const payload = await verifyCfAccessToken(
        token,
        c.env.CF_ACCESS_TEAM_DOMAIN,
        c.env.CF_ACCESS_AUD,
      );
      c.set("adminEmail", payload.email);
    } catch {
      return c.json(
        createAuthError("UNAUTHENTICATED", "Invalid CF Access token"),
        401,
      );
    }

    return next();
  };
}
