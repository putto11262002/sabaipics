import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClerkAuth } from '@sabaipics/auth/middleware';
import { createDb } from '@sabaipics/db';
import { authRouter } from './routes/auth';
import { webhookRouter } from './routes/webhooks';
import { dbTestRouter } from './routes/db-test';
import { adminRouter } from './routes/admin';
import { consentRouter } from './routes/consent';
import { dashboardRouter } from './routes/dashboard/route';
import { creditsRouter } from './routes/credits';
import { eventsRouter } from './routes/events';
import { photosRouter, photosUploadRouter, photoStatusRouter, bulkDownloadRouter, bulkDeleteRouter } from './routes/photos';
import { r2Router } from './routes/r2';
import type { Env, Bindings } from './types';

// Queue consumers
import { queue as photoQueue } from './queue/photo-consumer';
import { queue as cleanupQueue } from './queue/cleanup-consumer';

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
	// DB injection for webhooks (no auth, no CORS - verified by signature)
	.use((c, next) => {
		c.set('db', () => createDb(c.env.DATABASE_URL));
		return next();
	})
	// R2 proxy route (public, no auth - serves QR codes and other assets)
	.route('/r2', r2Router)
	// Webhooks route (uses c.var.db from above)
	.route('/webhooks', webhookRouter)
	// Then CORS and auth for all other routes
	.use('/*', (c, next) => {
		return cors({
			origin: c.env.CORS_ORIGIN,
			credentials: true,
		})(c, next);
	})
	// Admin routes - API key auth, no Clerk (must be before Clerk middleware)
	.route('/admin', adminRouter)
	.use('/*', createClerkAuth())
	.route('/credit-packages', creditsRouter)
	.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))
	.route('/db-test', dbTestRouter)
	.route('/auth', authRouter)
	.route('/consent', consentRouter)
	.route('/dashboard', dashboardRouter)
	.route('/events', eventsRouter)
	.route('/events', photosRouter)
	.route('/events', bulkDownloadRouter)
	.route('/events', bulkDeleteRouter)
	.route('/photos', photosUploadRouter)
	.route('/photos', photoStatusRouter);

// =============================================================================
// Worker Export
// =============================================================================

// Export type for Hono RPC client
export type AppType = typeof app;

// Export worker with fetch, queue, and scheduled handlers
export default {
	fetch: app.fetch,
	queue: async (batch: MessageBatch, env: Bindings, ctx: ExecutionContext) => {
		// Route by queue name
		if (batch.queue === 'photo-processing' || batch.queue === 'photo-processing-staging') {
			return photoQueue(batch as MessageBatch<any>, env, ctx);
		}
		if (batch.queue === 'rekognition-cleanup' || batch.queue === 'rekognition-cleanup-staging') {
			return cleanupQueue(batch as MessageBatch<any>, env);
		}
		console.error('[Queue] Unknown queue:', batch.queue);
	},
	scheduled,
};
