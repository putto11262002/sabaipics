import type { MiddlewareHandler } from "hono";
import { createAuthError } from "@sabaipics/auth/errors";
import type { PhotographerVariables } from "./require-photographer";

type Env = {
  Variables: PhotographerVariables;
};

/**
 * Middleware that requires PDPA consent
 *
 * Must be used AFTER requirePhotographer() middleware
 *
 * Checks that photographer.pdpaConsentAt is not null
 *
 * @returns 403 if consent not given
 */
export function requireConsent(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const photographer = c.get("photographer");
    if (!photographer.pdpaConsentAt) {
      return c.json(
        createAuthError("FORBIDDEN", "PDPA consent required"),
        403
      );
    }
    return next();
  };
}
