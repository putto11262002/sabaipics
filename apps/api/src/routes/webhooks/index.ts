import { Hono } from "hono";
import { clerkWebhookRouter } from "./clerk";

/**
 * Webhook Routes
 *
 * These routes handle incoming webhooks from external services.
 * They are NOT protected by auth middleware - verification is done via signatures.
 */
export const webhookRouter = new Hono()
	.route("/clerk", clerkWebhookRouter);

export type WebhookRouterType = typeof webhookRouter;
