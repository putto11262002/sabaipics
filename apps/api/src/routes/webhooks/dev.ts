import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { apiError } from '../../lib/error';
import type { Env } from '../../types';

/**
 * Dev Webhook Routes
 *
 * These routes are only available in development mode.
 * Used for proxying R2 notifications from the remote proxy worker to local queues.
 *
 * Flow: R2 notification → r2-notification-proxy → ngrok → this endpoint → UPLOAD_QUEUE / LOGO_QUEUE → consumer
 */

const r2NotificationSchema = z.object({
  account: z.string(),
  bucket: z.string(),
  eventTime: z.string(),
  action: z.string(),
  object: z.object({
    key: z.string(),
    size: z.number(),
    eTag: z.string(),
  }),
});

export const devWebhookRouter = new Hono<Env>().post(
  '/r2-notification',
  zValidator('json', r2NotificationSchema),
  async (c) => {
    // Only allow in development mode
    if (c.env.NODE_ENV !== 'development') {
      return apiError(c, 'FORBIDDEN', 'This endpoint is only available in development mode');
    }

    const notification = c.req.valid('json');

    // Dispatch to the correct queue based on R2 key prefix
    const queue = notification.object.key.startsWith('logos/')
      ? c.env.LOGO_QUEUE
      : c.env.UPLOAD_QUEUE;

    await queue.send({
      account: notification.account,
      bucket: notification.bucket,
      eventTime: notification.eventTime,
      action: notification.action,
      object: notification.object,
    });

    return c.json({ success: true });
  },
);

export type DevWebhookRouterType = typeof devWebhookRouter;
