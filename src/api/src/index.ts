import * as Sentry from '@sentry/cloudflare';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAnyAuth } from './middleware/any-auth';
import { createDbHttp, createDbTx } from '@/db';
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
import { lineParticipantRouter } from './routes/participant/line';
import { publicAnnouncementsRouter } from './routes/announcements';
import { ftpRouter } from './routes/ftp';
import { desktopAuthRouter } from './routes/desktop-auth';
import { studioRouter } from './routes/studio';
import { feedbackRouter } from './routes/feedback';
import { lineDeliveryRouter } from './routes/line-delivery';
import type { Env, Bindings } from './types';

// Queue consumers
import { queue as photoQueue } from './queue/photo-consumer';
import { queue as cleanupQueue } from './queue/cleanup-consumer';
import { queue as uploadQueue } from './queue/upload-consumer';
import logoUploadConsumer from './queue/logo-upload-consumer';
import lutProcessingConsumer from './queue/lut-processing-consumer';

// Cron handlers
import { scheduled } from './crons';

// Event handlers - registered at module load time
import { registerStripeHandlers } from './handlers/stripe';


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
  // Health check - public, no auth (used by iOS connectivity probe)
  .get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))
  // Participant routes (public, no auth - for event participants)
  .route('/participant', participantRouter)
  // LINE participant routes (public, no auth - LINE Login OAuth + delivery)
  .route('/participant/line', lineParticipantRouter)
  // Public announcements (no auth - for www/dashboard)
  .route('/announcements', publicAnnouncementsRouter)
  // Admin routes - API key auth, no Clerk (must be before Clerk middleware)
  .route('/admin', adminRouter)
  // FTP routes - FTP JWT auth, no Clerk (must be before Clerk middleware)
  .route('/api/ftp', ftpRouter)
  .use('/*', createAnyAuth())
  .route('/credit-packages', creditsRouter)
  .route('/desktop/auth', desktopAuthRouter)
  .route('/auth', authRouter)
  .route('/dashboard', dashboardRouter)
  .route('/studio', studioRouter)
  .route('/line-delivery', lineDeliveryRouter)
  .route('/events', eventsRouter)
  .route('/uploads', uploadsRouter)
  .route('/feedback', feedbackRouter)
  .route('/', photosRouter);

// =============================================================================
// Worker Export
// =============================================================================

// Export type for Hono RPC client
export type AppType = typeof app;

// Export worker with fetch, queue, and scheduled handlers
// Sentry.withSentry wraps all handlers (fetch, queue, scheduled) for error capture
export default Sentry.withSentry(
  (env: Bindings) => ({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    debug: env.NODE_ENV === 'staging',
  }),
  {
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
      if (batch.queue.startsWith('logo-processing')) {
        return logoUploadConsumer.queue(batch as MessageBatch<any>, env);
      }
      if (batch.queue.startsWith('lut-processing')) {
        return lutProcessingConsumer.queue(batch as MessageBatch<any>, env);
      }
      console.error('[Queue] Unknown queue:', batch.queue);
    },
    scheduled,
  },
);
