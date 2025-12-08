import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClerkAuth } from "@sabaipics/auth/middleware";
import type { AuthBindings, AuthVariables } from "@sabaipics/auth/types";
import { authRouter } from "./routes/auth";
import { webhookRouter } from "./routes/webhooks";
import { dbTestRouter } from "./routes/db-test";

// Queue consumer
import {
  createQueueHandler,
  processPhoto,
  type QueueConsumerEnv,
} from "./queue/photo-consumer";
import type { PhotoJob } from "./types/photo-job";

// Durable Objects - must be exported for wrangler
export { RekognitionRateLimiter } from "./durable-objects/rate-limiter";

// =============================================================================
// Types
// =============================================================================

type Bindings = AuthBindings &
  QueueConsumerEnv & {
    // API specific
    CORS_ORIGIN: string;
    CLERK_WEBHOOK_SIGNING_SECRET: string;

    // Queue producer
    PHOTO_QUEUE: Queue<PhotoJob>;
  };

type Variables = AuthVariables;

// =============================================================================
// Hono App
// =============================================================================

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

// =============================================================================
// Worker Export
// =============================================================================

// Export type for Hono RPC client
export type AppType = typeof app;

// Queue handler - processes photos via Rekognition
const queueHandler = createQueueHandler(processPhoto);

// Export worker with both fetch and queue handlers
export default {
  fetch: app.fetch,
  queue: queueHandler,
};
