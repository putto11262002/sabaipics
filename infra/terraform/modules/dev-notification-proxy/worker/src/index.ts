/**
 * R2 Notification Proxy Worker
 *
 * Consumes R2 notifications from queue and forwards to local dev server via ngrok.
 * This enables testing the presigned upload flow locally.
 */

interface R2Notification {
  account: string;
  bucket: string;
  eventTime: string;
  action: string;
  object: {
    key: string;
    size: number;
    eTag: string;
  };
}

export default {
  async queue(batch: MessageBatch<R2Notification>, env: Cloudflare.Env): Promise<void> {
    for (const message of batch.messages) {
      const notification = message.body;

      try {
        const response = await fetch(env.WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notification),
        });

        if (response.ok) {
          message.ack();
        } else {
          console.error(`[r2-notification-proxy] Webhook failed: ${response.status}`);
          message.retry();
        }
      } catch (error) {
        console.error('[r2-notification-proxy] Webhook error:', error);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Cloudflare.Env, R2Notification>;
