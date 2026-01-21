import type { MiddlewareHandler } from "hono";
import { createClerkClient } from "@clerk/backend";
import type { AuthBindings, AuthVariables, AuthObject } from "./types";
import { createAuthError } from "./errors";

/**
 * Clerk authenticateRequest status values:
 * - "signed-in": Valid token, user authenticated
 * - "signed-out": No token provided or invalid
 *
 * Rejection reasons (logged server-side, not exposed to client):
 * - "token-expired": JWT has expired
 * - "token-invalid": JWT signature verification failed
 * - "token-not-active-yet": JWT nbf claim is in the future
 * - "session-token-missing": No Authorization header
 */

type AuthEnv = { Bindings: AuthBindings; Variables: AuthVariables };

// Base auth middleware - extracts and verifies JWT, allows unauthenticated
export function createClerkAuth(): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    // Test mode bypass - inject mock auth for integration testing
    // Uses NODE_ENV which Vitest automatically sets to 'test' during test runs
    const nodeEnv = process.env.NODE_ENV as string | undefined;
    if (nodeEnv === "test") {
      const auth: AuthObject = {
        userId: "test_clerk_user_integration",
        sessionId: "test_session_integration",
      };
      c.set("auth", auth);
      return next();
    }

    const clerkClient = createClerkClient({
      secretKey: c.env.CLERK_SECRET_KEY,
      publishableKey: c.env.CLERK_PUBLISHABLE_KEY,
    });

    const authorizedParties = c.env.AUTHORIZED_PARTIES.split(",");

    // Networkless verification with jwtKey
    const requestState = await clerkClient.authenticateRequest(c.req.raw, {
      jwtKey: c.env.CLERK_JWT_KEY,
      authorizedParties,
    });

    if (requestState.status === "signed-in") {
      const clerkAuth = requestState.toAuth();
      // When status is "signed-in", userId and sessionId are guaranteed
      const auth: AuthObject = {
        userId: clerkAuth.userId!,
        sessionId: clerkAuth.sessionId!,
      };
      c.set("auth", auth);
    } else {
      // Log rejection reason for debugging (not exposed to client)
      const reason = requestState.reason;
      if (reason && reason !== "session-token-missing") {
        console.warn(`[auth] Token rejected: ${reason}`);
      }
      c.set("auth", null);
    }

    return next();
  };
}

// Require authenticated user
export function requireAuth(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth) {
      // Generic error - specific reason already logged in createClerkAuth
      return c.json(
        createAuthError("UNAUTHENTICATED", "Authentication required"),
        401,
      );
    }
    return next();
  };
}
