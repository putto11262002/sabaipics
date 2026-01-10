import { Hono } from "hono";
import { Webhook } from "svix";
import { photographers } from "@sabaipics/db/schema";
import { eq } from "drizzle-orm";
import type { Database } from "@sabaipics/db";

/**
 * Clerk Webhook Types
 * Based on Clerk's webhook payload structure
 */
interface ClerkWebhookEvent {
	data: {
		id: string;
		email_addresses?: Array<{
			email_address: string;
			id: string;
		}>;
		first_name?: string | null;
		last_name?: string | null;
		image_url?: string;
		external_accounts?: Array<{
			provider: string;
			provider_user_id: string;
		}>;
		public_metadata?: Record<string, unknown>;
		unsafe_metadata?: Record<string, unknown>;
		created_at?: number;
		updated_at?: number;
	};
	type: string;
	object: "event";
}

type WebhookBindings = {
	CLERK_WEBHOOK_SIGNING_SECRET: string;
};

type WebhookVariables = {
	db: () => Database;
};

export const clerkWebhookRouter = new Hono<{
	Bindings: WebhookBindings;
	Variables: WebhookVariables;
}>().post("/", async (c) => {
	const secret = c.env.CLERK_WEBHOOK_SIGNING_SECRET;

	if (!secret) {
		console.error("[Clerk Webhook] CLERK_WEBHOOK_SIGNING_SECRET not configured");
		return c.json({ error: "Webhook secret not configured" }, 500);
	}

	// Get raw body for signature verification
	const body = await c.req.text();

	// Get Svix headers
	const svixId = c.req.header("svix-id");
	const svixTimestamp = c.req.header("svix-timestamp");
	const svixSignature = c.req.header("svix-signature");

	if (!svixId || !svixTimestamp || !svixSignature) {
		console.error("[Clerk Webhook] Missing svix headers");
		return c.json({ error: "Missing webhook headers" }, 400);
	}

	// Verify webhook signature
	const wh = new Webhook(secret);
	let event: ClerkWebhookEvent;

	try {
		event = wh.verify(body, {
			"svix-id": svixId,
			"svix-timestamp": svixTimestamp,
			"svix-signature": svixSignature,
		}) as ClerkWebhookEvent;
	} catch (err) {
		console.error("[Clerk Webhook] Signature verification failed:", err);
		return c.json({ error: "Invalid webhook signature" }, 400);
	}

	// Route to appropriate handler
	try {
		switch (event.type) {
			case "user.created":
				await handleUserCreated(event, c.var.db);
				break;
			case "user.updated":
				await handleUserUpdated(event, c.var.db);
				break;
			case "user.deleted":
				await handleUserDeleted(event, c.var.db);
				break;
			default:
				console.log(`[Clerk Webhook] Unhandled event type: ${event.type}`);
		}
	} catch (handlerError) {
		// Log error but return 200 to prevent retries on bad data
		console.error(
			`[Clerk Webhook] Handler error for ${event.type}:`,
			handlerError
		);
	}

	return c.json({ success: true }, 200);
});

/**
 * Handle user.created event
 * Creates photographer record in database
 * Per plan decision #4: only photographers sign up (no user_type check needed)
 */
async function handleUserCreated(
	event: ClerkWebhookEvent,
	getDb: () => Database
) {
	const user = event.data;
	const db = getDb();

	// Extract primary email (required per decision #10)
	const email = user.email_addresses?.[0]?.email_address;
	if (!email) {
		console.error(
			"[Clerk Webhook] user.created: No email found for user",
			user.id
		);
		return;
	}

	// Build display name
	const displayName =
		[user.first_name, user.last_name].filter(Boolean).join(" ") || null;

	console.log("[Clerk Webhook] user.created:");
	console.log("  Clerk User ID:", user.id);
	console.log("  Email:", email);
	console.log("  Display Name:", displayName || "(none)");

	// Idempotency check: see if photographer already exists
	const [existing] = await db
		.select({ id: photographers.id })
		.from(photographers)
		.where(eq(photographers.clerkId, user.id))
		.limit(1);

	if (existing) {
		console.log("  → Photographer already exists, skipping (idempotent)");
		return;
	}

	// Insert new photographer record
	try {
		const [newPhotographer] = await db
			.insert(photographers)
			.values({
				clerkId: user.id,
				email,
				name: displayName,
			})
			.returning();

		console.log("  ✓ Created photographer:", newPhotographer.id);
	} catch (error) {
		console.error("  ✗ Failed to create photographer:", error);
		throw error;
	}
}

/**
 * Handle user.updated event
 * Syncs profile changes to database
 */
async function handleUserUpdated(
	event: ClerkWebhookEvent,
	getDb: () => Database
) {
	const user = event.data;
	const db = getDb();

	// Extract primary email
	const email = user.email_addresses?.[0]?.email_address;

	// Build display name
	const displayName =
		[user.first_name, user.last_name].filter(Boolean).join(" ") || null;

	console.log("[Clerk Webhook] user.updated:");
	console.log("  Clerk User ID:", user.id);
	console.log("  Email:", email);
	console.log("  Display Name:", displayName || "(none)");

	// TODO: Update photographer record when needed
	// await db.update(photographers)
	//   .set({ email, name: displayName })
	//   .where(eq(photographers.clerkId, user.id));
}

/**
 * Handle user.deleted event
 * Soft deletes photographer record
 */
async function handleUserDeleted(
	event: ClerkWebhookEvent,
	getDb: () => Database
) {
	const user = event.data;

	console.log("[Clerk Webhook] user.deleted:");
	console.log("  Clerk User ID:", user.id);

	// TODO: Soft delete photographer when needed
	// await db.update(photographers)
	//   .set({ deletedAt: new Date() })
	//   .where(eq(photographers.clerkId, user.id));
}
