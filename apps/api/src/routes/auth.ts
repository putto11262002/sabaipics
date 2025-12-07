import { Hono } from "hono";
import { requireAuth } from "@sabaipics/auth/middleware";
import type { AuthBindings, AuthVariables } from "@sabaipics/auth/types";

type Env = { Bindings: AuthBindings; Variables: AuthVariables };

export const authRouter = new Hono<Env>()
  .get("/me", (c) => {
    const auth = c.get("auth");
    return c.json({ userId: auth?.userId ?? null });
  })
  // Protected route - requires authentication
  .get("/profile", requireAuth(), (c) => {
    const auth = c.get("auth");
    return c.json({
      message: "This is a protected route",
      user: {
        userId: auth?.userId,
        sessionId: auth?.sessionId,
      },
      timestamp: Date.now(),
    });
  });
