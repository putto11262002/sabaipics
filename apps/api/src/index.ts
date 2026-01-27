import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClerkAuth } from '@sabaipics/auth/middleware';
import { createDbHttp, createDbTx } from '@sabaipics/db';
import { authRouter } from './routes/auth';
import { webhookRouter } from './routes/webhooks';
import { adminRouter } from './routes/admin';
import { dashboardRouter } from './routes/dashboard/route';
import { creditsRouter } from './routes/credits';
import { eventsRouter } from './routes/events';
import { photosRouter } from './routes/photos';
import { uploadsRouter } from './routes/uploads';
import { r2Router } from './routes/r2';
import { participantRouter } from './routes/participant';
import type { Env, Bindings } from './types';

// Queue consumers
import { queue as photoQueue } from './queue/photo-consumer';
import { queue as cleanupQueue } from './queue/cleanup-consumer';
import { queue as uploadQueue } from './queue/upload-consumer';

// Cron handlers
import { scheduled } from './crons';

// Event handlers - registered at module load time
import { registerStripeHandlers } from './handlers/stripe';

// Durable Objects - must be exported for wrangler
export { RekognitionRateLimiter } from './durable-objects/rate-limiter';

// =============================================================================
// Event Bus Initialization
// =============================================================================

// Register all event handlers at startup
// Will n
registerStripeHandlers();

// =============================================================================
// Hono App
// =============================================================================

// Method chaining - NEVER break the chain for type inference
const app = new Hono<Env>()
  // DB injection - dual adapter pattern:
  // - db (HTTP): Fast, stateless, no transactions - for 90% of queries
  // - dbTx (WebSocket): With transaction support - for critical multi-step operations
  .use((c, next) => {
    c.set('db', () => createDbHttp(c.env.DATABASE_URL));
    c.set('dbTx', () => createDbTx(c.env.DATABASE_URL));
    return next();
  })
  // R2 proxy route (public, no auth - serves QR codes and other assets)
  .route('/local/r2', r2Router)
  // Webhooks route (no CORS needed - server-to-server calls)
  .route('/webhooks', webhookRouter)
  // CORS middleware - must be before participant and other browser-facing routes
  .use('/*', (c, next) => {
    // Support comma-separated origins for dev (e.g., "http://localhost:5173,http://localhost:5174")
    const allowedOrigins = c.env.CORS_ORIGIN.split(',').map((o) => o.trim());
    return cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
      credentials: true,
    })(c, next);
  })
  // Participant routes (public, no auth - for event participants)
  .route('/participant', participantRouter)
  // Admin routes - API key auth, no Clerk (must be before Clerk middleware)
  .route('/admin', adminRouter)
  .use('/*', createClerkAuth())
  .route('/credit-packages', creditsRouter)
  .get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))
  .route('/auth', authRouter)
  .route('/dashboard', dashboardRouter)
  .route('/events', eventsRouter)
  .route('/uploads', uploadsRouter)
  .route('/', photosRouter);

// =============================================================================
// Worker Export
// =============================================================================

// Export type for Hono RPC client
export type AppType = typeof app;

// Export worker with fetch, queue, and scheduled handlers
export default {
  fetch: app.fetch,
  queue: async (batch: MessageBatch, env: Bindings, ctx: ExecutionContext) => {
    // Route by queue name prefix (handles -dev, -staging, etc.)
    if (batch.queue.startsWith('photo-processing')) {
      return photoQueue(batch as MessageBatch<any>, env, ctx);
    }
    if (batch.queue.startsWith('rekognition-cleanup')) {
      return cleanupQueue(batch as MessageBatch<any>, env);
    }
    if (batch.queue.startsWith('upload-processing')) {
      return uploadQueue(batch as MessageBatch<any>, env, ctx);
    }
    console.error('[Queue] Unknown queue:', batch.queue);
  },
  scheduled,
};
