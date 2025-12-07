import { Hono } from "hono";
import { Webhook } from "svix";

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

export const clerkWebhookRouter = new Hono<{ Bindings: WebhookBindings }>().post(
	"/",
	async (c) => {
		const secret = c.env.CLERK_WEBHOOK_SIGNING_SECRET;

		if (!secret) {
			console.error("CLERK_WEBHOOK_SIGNING_SECRET not configured");
			return c.json({ error: "Webhook secret not configured" }, 500);
		}

		// Get raw body for signature verification
		const body = await c.req.text();

		// Get Svix headers
		const svixId = c.req.header("svix-id");
		const svixTimestamp = c.req.header("svix-timestamp");
		const svixSignature = c.req.header("svix-signature");

		if (!svixId || !svixTimestamp || !svixSignature) {
			console.error("Missing svix headers");
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
			console.error("Webhook verification failed:", err);
			return c.json({ error: "Invalid webhook signature" }, 400);
		}

		// Route to appropriate handler
		switch (event.type) {
			case "user.created":
				await handleUserCreated(event);
				break;
			case "user.updated":
				await handleUserUpdated(event);
				break;
			case "user.deleted":
				await handleUserDeleted(event);
				break;
			default:
				console.log(`Unhandled webhook event type: ${event.type}`);
		}

		return c.json({ success: true }, 200);
	},
);

/**
 * Handle user.created event
 * Creates photographer or participant record based on user_type metadata
 */
async function handleUserCreated(event: ClerkWebhookEvent) {
	const user = event.data;

	// Extract user type from unsafe_metadata
	// TODO: SECURITY - user_type from unsafeMetadata is not secure
	// Anyone can set this during signup. Should verify from signup URL/origin
	// or use separate Clerk apps per user type. Flagged for post-MVP fix.
	const userType =
		(user.unsafe_metadata?.user_type as string) || "participant";

	// Extract primary email
	const email = user.email_addresses?.[0]?.email_address;

	// Extract LINE user ID if signed up via LINE
	const lineAccount = user.external_accounts?.find(
		(acc) => acc.provider === "oauth_line",
	);
	const lineUserId = lineAccount?.provider_user_id;

	// Build display name
	const displayName =
		[user.first_name, user.last_name].filter(Boolean).join(" ") || null;

	console.log("========== USER CREATED ==========");
	console.log("Clerk User ID:", user.id);
	console.log("User Type:", userType);
	console.log("Email:", email);
	console.log("Display Name:", displayName);
	console.log("Avatar URL:", user.image_url);
	console.log("LINE User ID:", lineUserId || "N/A");
	console.log("Created At:", user.created_at);
	console.log("===================================");

	// TODO: Insert into database when Postgres is set up
	// if (userType === 'photographer') {
	//   await db.insert(photographers).values({
	//     clerk_user_id: user.id,
	//     email,
	//     display_name: displayName,
	//     avatar_url: user.image_url,
	//   });
	// } else {
	//   await db.insert(participants).values({
	//     clerk_user_id: user.id,
	//     display_name: displayName,
	//     avatar_url: user.image_url,
	//     line_user_id: lineUserId,
	//     line_linked: false, // Updated via LINE webhook
	//   });
	// }
}

/**
 * Handle user.updated event
 * Syncs profile changes to our database
 */
async function handleUserUpdated(event: ClerkWebhookEvent) {
	const user = event.data;

	// Extract primary email
	const email = user.email_addresses?.[0]?.email_address;

	// Build display name
	const displayName =
		[user.first_name, user.last_name].filter(Boolean).join(" ") || null;

	console.log("========== USER UPDATED ==========");
	console.log("Clerk User ID:", user.id);
	console.log("Email:", email);
	console.log("Display Name:", displayName);
	console.log("Avatar URL:", user.image_url);
	console.log("Updated At:", user.updated_at);
	console.log("===================================");

	// TODO: Update database when Postgres is set up
	// await db.update(photographers)
	//   .set({
	//     email,
	//     display_name: displayName,
	//     avatar_url: user.image_url,
	//     updated_at: new Date(),
	//   })
	//   .where(eq(photographers.clerk_user_id, user.id));
	//
	// await db.update(participants)
	//   .set({
	//     display_name: displayName,
	//     avatar_url: user.image_url,
	//     updated_at: new Date(),
	//   })
	//   .where(eq(participants.clerk_user_id, user.id));
}

/**
 * Handle user.deleted event
 * Soft deletes user record
 */
async function handleUserDeleted(event: ClerkWebhookEvent) {
	const user = event.data;

	console.log("========== USER DELETED ==========");
	console.log("Clerk User ID:", user.id);
	console.log("===================================");

	// TODO: Soft delete in database when Postgres is set up
	// await db.update(photographers)
	//   .set({ deleted_at: new Date() })
	//   .where(eq(photographers.clerk_user_id, user.id));
	//
	// await db.update(participants)
	//   .set({ deleted_at: new Date() })
	//   .where(eq(participants.clerk_user_id, user.id));
}
