import { Hono } from 'hono';
import { clerkWebhookRouter } from './clerk';
import { devWebhookRouter } from './dev';
import { lineWebhookRouter } from './line';
import { stripeWebhookRouter } from './stripe';

/**
 * Webhook Routes
 *
 * These routes handle incoming webhooks from external services.
 * They are NOT protected by auth middleware - verification is done via signatures.
 *
 * Endpoints:
 * - POST /webhooks/clerk - Clerk user events
 * - POST /webhooks/stripe - Stripe payment events
 * - POST /webhooks/line - LINE Messaging API events
 * - POST /webhooks/dev/r2-notification - Dev-only R2 notification proxy (local testing)
 */
export const webhookRouter = new Hono()
  .route('/clerk', clerkWebhookRouter)
  .route('/dev', devWebhookRouter)
  .route('/line', lineWebhookRouter)
  .route('/stripe', stripeWebhookRouter);

export type WebhookRouterType = typeof webhookRouter;
