import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClerkAuth } from "@sabaipics/auth/middleware";
import type { AuthBindings, AuthVariables } from "@sabaipics/auth/types";
import { authRouter } from "./routes/auth";
import { webhookRouter } from "./routes/webhooks";
import { dbTestRouter } from "./routes/db-test";

type Bindings = AuthBindings & {
  CORS_ORIGIN: string;
  CLERK_WEBHOOK_SIGNING_SECRET: string;
  DATABASE_URL: string;
};
type Variables = AuthVariables;

// Method chaining - NEVER break the chain for type inference
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  // Webhooks FIRST - no auth, no CORS (verified by signature)
  .route("/webhooks", webhookRouter)
  // Then CORS and auth for all other routes
  .use("/*", (c, next) => {
    return cors({
      origin: c.env.CORS_ORIGIN,
      credentials: true,
    })(c, next);
  })
  .use("/*", createClerkAuth())
  .get("/", (c) => c.text("SabaiPics API"))
  .get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }))
  .route("/db-test", dbTestRouter)
  .route("/auth", authRouter);
// Future protected routes:
// .use('/events/*', requireAuth())
// .route('/events', eventsRouter)

// Export type for Hono RPC client
export type AppType = typeof app;

export default app;
