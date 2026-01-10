import { Hono } from "hono";
import { Webhook } from "svix";
import { photographers } from "@sabaipics/db/schema";
import { eq } from "drizzle-orm";
import type { Database } from "@sabaipics/db";

// Use shared Bindings and Variables from index.ts
type Bindings = CloudflareBindings;
type Variables = {
	db: () => Database;
};

type Env = {
	Bindings: Bindings;
	Variables: Variables;
};

export const clerkWebhookRouter = new Hono<Env>().post("/", async (c) => {
	const secret = c.env.CLERK_WEBHOOK_SIGNING_SECRET;

	if (!secret) {
		console.error("[Clerk Webhook] CLERK_WEBHOOK_SIGNING_SECRET not configured");
		return c.json({ error: "Bad request" }, 400);
	}

	// Get raw body for signature verification
	const body = await c.req.text();

	// Get Svix headers
	const svixId = c.req.header("svix-id");
	const svixTimestamp = c.req.header("svix-timestamp");
	const svixSignature = c.req.header("svix-signature");

	if (!svixId || !svixTimestamp || !svixSignature) {
		return c.json({ error: "Bad request" }, 400);
	}

	// Verify webhook signature
	const wh = new Webhook(secret);
	let event: any;

	try {
		event = wh.verify(body, {
			"svix-id": svixId,
			"svix-timestamp": svixTimestamp,
			"svix-signature": svixSignature,
		});
	} catch (err) {
		return c.json({ error: "Bad request" }, 400);
	}

	// Route to appropriate handler
	try {
		switch (event.type) {
			case "user.created": {
				const db = c.var.db();
				const user = event.data;

				// Extract primary email (required)
				const email = user.email_addresses?.[0]?.email_address;
				if (!email) {
					console.error("[Clerk Webhook] user.created: No email found");
					return c.json({ success: true }, 200);
				}

				// Build display name
				const displayName =
					[user.first_name, user.last_name].filter(Boolean).join(" ") ||
					null;

				// Idempotency check
				const [existing] = await db
					.select({ id: photographers.id })
					.from(photographers)
					.where(eq(photographers.clerkId, user.id))
					.limit(1);

				if (!existing) {
					// Insert new photographer
					await db
						.insert(photographers)
						.values({
							clerkId: user.id,
							email,
							name: displayName,
						});
				}

				break;
			}

			case "user.updated": {
				// TODO: Sync profile changes to database
				break;
			}

			case "user.deleted": {
				// TODO: Soft delete photographer
				break;
			}

			default:
				// Ignore unhandled event types
				break;
		}
	} catch (handlerError) {
		// Log error but return 200 to prevent retries
		console.error("[Clerk Webhook] Handler error:", handlerError);
	}

	return c.json({ success: true }, 200);
});
