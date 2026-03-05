import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { createAnyAuth } from './middleware/any-auth';
import { createDbHttp, createDbTx } from '@/db';
import { requestLogger } from './middleware/request-logger';
import { emitStructuredLog } from './lib/observability/log';
import { emitCounterMetric } from './lib/observability/metrics';
import { getCurrentTraceSpan } from './lib/observability/trace-context';
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
import { observabilityRouter } from './routes/observability';
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
  .use(requestLogger())
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
  .get('/health', (c) => {
    const shouldFail = c.req.query('fail') === '1';
    if (shouldFail) {
      throw new HTTPException(500, { message: 'Simulated health failure' });
    }
    return c.json({ status: 'ok', timestamp: Date.now() });
  })
  // Participant routes (public, no auth - for event participants)
  .route('/participant', participantRouter)
  // LINE participant routes (public, no auth - LINE Login OAuth + delivery)
  .route('/participant/line', lineParticipantRouter)
  // Public announcements (no auth - for www/dashboard)
  .route('/announcements', publicAnnouncementsRouter)
  // Public observability ingest (dashboard/iOS client error events)
  .route('/observability', observabilityRouter)
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

app.onError((error, c) => {
  const path = new URL(c.req.url).pathname;
  const status = error instanceof HTTPException ? error.status : 500;
  const statusClass = `${Math.floor(status / 100)}xx`;
  const activeSpan = getCurrentTraceSpan();
  activeSpan?.markError({
    statusMessage: error.name,
    attributes: {
      'http.error.status': status,
      'error.name': error.name,
      'error.message': error.message,
    },
  });
  let requestId: string | null = null;
  let traceparent: string | null = null;
  try {
    requestId = c.get('requestId');
    traceparent = c.get('traceparent');
  } catch {
    // request logger middleware might not have run in tests
  }

  emitStructuredLog(c, 'error', 'unhandled_error', {
    request_id: requestId,
    traceparent,
    method: c.req.method,
    path,
    status,
    error_name: error.name,
    error_message: error.message,
  });
  emitCounterMetric(c.env, c.executionCtx as unknown as ExecutionContext, 'framefast_api_errors_total', 1, {
    status_class: statusClass,
    error_class: error instanceof HTTPException ? 'http_exception' : 'unhandled',
  });

  if (error instanceof HTTPException) {
    return error.getResponse();
  }

  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    500,
  );
});

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
    if (batch.queue.startsWith('logo-processing')) {
      return logoUploadConsumer.queue(batch as MessageBatch<any>, env, ctx);
    }
    if (batch.queue.startsWith('lut-processing')) {
      return lutProcessingConsumer.queue(batch as MessageBatch<any>, env);
    }
    console.error('[Queue] Unknown queue:', batch.queue);
  },
  scheduled,
};
