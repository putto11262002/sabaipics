import { Hono } from "hono";
import { clerkWebhookRouter } from "./clerk";
import { lineWebhookRouter } from "./line";
import { stripeWebhookRouter } from "./stripe";

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
 */
export const webhookRouter = new Hono()
	.route("/clerk", clerkWebhookRouter)
	.route("/line", lineWebhookRouter)
	.route("/stripe", stripeWebhookRouter);

export type WebhookRouterType = typeof webhookRouter;
