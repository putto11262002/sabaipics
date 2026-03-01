import { Hono } from 'hono';
import { z } from 'zod';
import { verifyLineSignature } from '../../lib/line/webhook';
import {
  WebhookRequestBodySchema,
  type WebhookEvent,
  type WebhookRequestBody,
} from '../../lib/line/schemas';
import { apiError } from '../../lib/error';

/**
 * LINE Webhook Bindings
 */
type LineWebhookBindings = {
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
};

/**
 * LINE Webhook Router
 *
 * Handles incoming webhooks from LINE Messaging API.
 * Verification is done via HMAC-SHA256 signature (no auth middleware).
 *
 * @see https://developers.line.biz/en/docs/messaging-api/receiving-messages/
 */
export const lineWebhookRouter = new Hono<{
  Bindings: LineWebhookBindings;
}>().post('/', async (c) => {
  const channelSecret = c.env.LINE_CHANNEL_SECRET;

  if (!channelSecret) {
    console.error('[LINE Webhook] LINE_CHANNEL_SECRET not configured');
    return apiError(c, 'INTERNAL_ERROR', 'Webhook secret not configured');
  }

  // Get signature header
  const signature = c.req.header('x-line-signature');
  if (!signature) {
    console.error('[LINE Webhook] Missing x-line-signature header');
    return apiError(c, 'BAD_REQUEST', 'Missing webhook signature header');
  }

  // Get raw body for signature verification
  const body = await c.req.text();

  // Verify signature
  const isValid = await verifyLineSignature(body, signature, channelSecret);
  if (!isValid) {
    console.error('[LINE Webhook] Signature verification failed');
    return apiError(c, 'UNAUTHORIZED', 'Invalid webhook signature');
  }

  // Parse and validate webhook body with Zod
  let webhookBody: WebhookRequestBody;
  try {
    const parsed = JSON.parse(body);
    webhookBody = WebhookRequestBodySchema.parse(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error('[LINE Webhook] Validation error:', err.errors);
      return apiError(c, 'BAD_REQUEST', 'Invalid webhook payload');
    }
    console.error('[LINE Webhook] Failed to parse request body');
    return apiError(c, 'BAD_REQUEST', 'Invalid JSON in webhook payload');
  }

  // Log destination (bot user ID)
  console.log('[LINE Webhook] Destination:', webhookBody.destination);
  console.log('[LINE Webhook] Events received:', webhookBody.events.length);

  // Process each event
  for (const event of webhookBody.events) {
    await handleEvent(event);
  }

  return c.json({ success: true }, 200);
});

/**
 * Handle a single LINE webhook event
 *
 * Logs all events for now. Specific handlers can be added later.
 */
async function handleEvent(event: WebhookEvent): Promise<void> {
  const timestamp = new Date(event.timestamp).toISOString();
  const source = formatSource(event.source);

  console.log('========== LINE WEBHOOK EVENT ==========');
  console.log('Type:', event.type);
  console.log('Timestamp:', timestamp);
  console.log('Source:', source);

  switch (event.type) {
    case 'message':
      console.log('Message Type:', event.message.type);
      if (event.message.type === 'text') {
        console.log('Text:', event.message.text);
      }
      console.log('Reply Token:', event.replyToken);
      break;

    case 'follow':
      console.log('Action: User added bot as friend');
      console.log('Reply Token:', event.replyToken);
      // TODO: Set line_linked=true in database when tables exist
      break;

    case 'unfollow':
      console.log('Action: User blocked/unfriended bot');
      // TODO: Set line_linked=false in database when tables exist
      break;

    case 'join':
      console.log('Action: Bot joined group/room');
      console.log('Reply Token:', event.replyToken);
      break;

    case 'leave':
      console.log('Action: Bot left group/room');
      break;

    case 'memberJoined':
      console.log('Action: Members joined group');
      console.log('Members:', event.joined.members.map((m) => m.userId).join(', '));
      break;

    case 'memberLeft':
      console.log('Action: Members left group');
      console.log('Members:', event.left.members.map((m) => m.userId).join(', '));
      break;

    case 'postback':
      console.log('Postback Data:', event.postback.data);
      console.log('Reply Token:', event.replyToken);
      break;

    case 'videoPlayComplete':
      console.log('Tracking ID:', event.videoPlayComplete.trackingId);
      break;

    case 'beacon':
      console.log('Beacon Type:', event.beacon.type);
      console.log('Beacon Hwid:', event.beacon.hwid);
      break;

    case 'accountLink':
      console.log('Link Result:', event.link.result);
      console.log('Nonce:', event.link.nonce);
      break;

    case 'unsend':
      console.log('Unsent Message ID:', event.unsend.messageId);
      break;
  }

  console.log('=========================================');
}

/**
 * Format event source for logging
 */
function formatSource(
  source:
    | { type: 'user'; userId: string }
    | { type: 'group'; groupId: string; userId?: string }
    | { type: 'room'; roomId: string; userId?: string }
    | undefined,
): string {
  if (!source) return 'unknown';

  switch (source.type) {
    case 'user':
      return `user:${source.userId}`;
    case 'group':
      return `group:${source.groupId}${source.userId ? ` (user:${source.userId})` : ''}`;
    case 'room':
      return `room:${source.roomId}${source.userId ? ` (user:${source.userId})` : ''}`;
    default:
      return 'unknown';
  }
}
