import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClerkAuth } from "@sabaipics/auth/middleware";
import { createDb } from "@sabaipics/db";
import { authRouter } from "./routes/auth";
import { webhookRouter } from "./routes/webhooks";
import { dbTestRouter } from "./routes/db-test";
import { adminRouter } from "./routes/admin";
import { consentRouter } from "./routes/consent";
import { creditsRouter } from "./routes/credits";
import type { Bindings, Variables } from "./types";

// Queue consumer
import { queue } from "./queue/photo-consumer";

// Event handlers - registered at module load time
import { registerStripeHandlers } from "./handlers/stripe";

// Durable Objects - must be exported for wrangler
export { RekognitionRateLimiter } from "./durable-objects/rate-limiter";

// =============================================================================
// Event Bus Initialization
// =============================================================================

// Register all event handlers at startup
registerStripeHandlers();

// =============================================================================
// Hono App
// =============================================================================

// Method chaining - NEVER break the chain for type inference
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  // DB injection for webhooks (no auth, no CORS - verified by signature)
  .use("/webhooks/*", (c, next) => {
    c.set("db", () => createDb(c.env.DATABASE_URL));
    return next();
  })
  // Webhooks route (uses c.var.db from above)
  .route("/webhooks", webhookRouter)
  // Then CORS and auth for all other routes
  .use("/*", (c, next) => {
    return cors({
      origin: c.env.CORS_ORIGIN,
      credentials: true,
    })(c, next);
  })
  .use("/*", (c, next) => {
    c.set("db", () => createDb(c.env.DATABASE_URL));
    return next();
  })
  // Admin routes - API key auth, no Clerk (must be before Clerk middleware)
  .route("/admin", adminRouter)
  // Public credit packages - no auth required
  .route("/credit-packages", creditsRouter)
  .use("/*", createClerkAuth())
  .get("/", (c) => c.text("SabaiPics API"))
  .get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }))
  .route("/db-test", dbTestRouter)
  .route("/auth", authRouter)
  .route("/consent", consentRouter);
// Future protected routes:
// .use('/events/*', requireAuth())
// .route('/events', eventsRouter)

// =============================================================================
// Worker Export
// =============================================================================

// Export type for Hono RPC client
export type AppType = typeof app;

// Export worker with both fetch and queue handlers
export default {
  fetch: app.fetch,
  queue,
};
