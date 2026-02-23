import { Hono } from 'hono';
import { Webhook } from 'svix';
import { photographers, consentRecords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { Database } from '@/db';
import type { Env } from '../../types';
import { apiError } from '../../lib/error';

// Use shared types from ../../types

// Minimal type for Clerk webhook events (no validation, trust Svix signature)
interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{
      id: string;
      email_address: string;
      verification?: { status: string } | null;
    }>;
    primary_email_address_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    locked?: boolean;
    legal_accepted_at?: string | null;
  };
}

/**
 * Extract the primary email address from user data.
 */
function getPrimaryEmail(user: ClerkWebhookEvent['data']): string | null {
  const emails = user.email_addresses;
  if (!emails?.length) return null;

  // Find by primary_email_address_id
  if (user.primary_email_address_id) {
    const primary = emails.find((e) => e.id === user.primary_email_address_id);
    if (primary) return primary.email_address;
  }

  // Fallback: first verified email
  const verified = emails.find((e) => e.verification?.status === 'verified');
  if (verified) return verified.email_address;

  // Last resort: first email
  return emails[0]?.email_address ?? null;
}

export const clerkWebhookRouter = new Hono<Env>().post('/', async (c) => {
  const secret = c.env.CLERK_WEBHOOK_SIGNING_SECRET;

  if (!secret) {
    console.error('[Clerk Webhook] CLERK_WEBHOOK_SIGNING_SECRET not configured');
    return apiError(c, 'INTERNAL_ERROR', 'Webhook secret not configured');
  }

  // Get raw body for signature verification
  const body = await c.req.text();

  // Get Svix headers
  const svixId = c.req.header('svix-id');
  const svixTimestamp = c.req.header('svix-timestamp');
  const svixSignature = c.req.header('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return apiError(c, 'BAD_REQUEST', 'Missing webhook signature headers');
  }

  // Verify webhook signature (Svix ensures payload integrity)
  const wh = new Webhook(secret);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error('[Clerk Webhook] Signature verification failed:', err);
    return apiError(c, 'UNAUTHORIZED', 'Invalid webhook signature');
  }

  // Route to appropriate handler
  try {
    switch (event.type) {
      case 'user.created': {
        const db = c.var.db();
        const user = event.data;

        // Extract primary email (required)
        const email = getPrimaryEmail(user);
        if (!email) {
          console.error('[Clerk Webhook] ERROR: user.created without required email');
          return apiError(c, 'BAD_REQUEST', 'User created without email');
        }

        // Build display name
        const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;

        // Check if user accepted legal consent (from Clerk built-in feature)
        const pdpaConsentAt = user.legal_accepted_at
          ? new Date(user.legal_accepted_at).toISOString()
          : null;

        // Idempotency check
        const [existing] = await db
          .select({ id: photographers.id })
          .from(photographers)
          .where(eq(photographers.clerkId, user.id))
          .limit(1);

        if (!existing) {
          // Insert new photographer with consent status
          await db.insert(photographers).values({
            clerkId: user.id,
            email,
            name: displayName,
            pdpaConsentAt,
          });

          // Create consent record if user accepted consent
          if (pdpaConsentAt) {
            const [newPhotographer] = await db
              .select({ id: photographers.id })
              .from(photographers)
              .where(eq(photographers.clerkId, user.id))
              .limit(1);

            if (newPhotographer) {
              await db.insert(consentRecords).values({
                photographerId: newPhotographer.id,
                consentType: 'pdpa',
                ipAddress: c.req.header('CF-Connecting-IP') || null,
              });
            }
          }
        }

        break;
      }

      case 'user.updated': {
        const db = c.var.db();
        const user = event.data;

        // Extract updated fields
        const email = getPrimaryEmail(user);
        const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;

        // Find existing photographer
        const [existing] = await db
          .select({ id: photographers.id, bannedAt: photographers.bannedAt })
          .from(photographers)
          .where(eq(photographers.clerkId, user.id))
          .limit(1);

        if (!existing) {
          // User might not be a photographer yet, skip silently
          console.log('[Clerk Webhook] user.updated: photographer not found, skipping', {
            clerkId: user.id,
          });
          break;
        }

        // Build update set
        const set: Record<string, unknown> = {};

        if (email) {
          set.email = email;
          set.name = displayName;
        }

        // Sync lock status (Clerk sends locked: true when account is locked)
        if (user.locked && !existing.bannedAt) {
          set.bannedAt = new Date().toISOString();
        } else if (!user.locked && existing.bannedAt) {
          set.bannedAt = null;
        }

        if (Object.keys(set).length > 0) {
          await db
            .update(photographers)
            .set(set)
            .where(eq(photographers.clerkId, user.id));

          console.log('[Clerk Webhook] user.updated: photographer updated', {
            clerkId: user.id,
            ...set,
          });
        }

        break;
      }

      case 'user.deleted': {
        const db = c.var.db();
        const user = event.data;

        // Soft delete photographer only (events will be cleaned up by separate cron)
        const result = await db
          .update(photographers)
          .set({ deletedAt: new Date().toISOString() })
          .where(eq(photographers.clerkId, user.id))
          .returning({ id: photographers.id });

        if (result.length === 0) {
          // User might not be a photographer, skip silently
          console.log('[Clerk Webhook] user.deleted: photographer not found, skipping', {
            clerkId: user.id,
          });
        } else {
          console.log('[Clerk Webhook] user.deleted: photographer soft deleted', {
            clerkId: user.id,
            photographerId: result[0].id,
          });
        }

        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }
  } catch (handlerError) {
    // Log error but return 200 to prevent retries
    console.error('[Clerk Webhook] Handler error:', handlerError);
  }

  return c.json({ success: true }, 200);
});
