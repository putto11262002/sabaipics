/**
 * Clerk Webhook Event Schemas
 *
 * Zod schemas for validating and typing Clerk webhook events.
 *
 * ## Clerk Event Structure
 *
 * Clerk webhooks follow this structure:
 * ```json
 * {
 *   "type": "user.created",
 *   "data": { ...user object }
 * }
 * ```
 *
 * ## References
 * - https://clerk.com/docs/guides/development/webhooks/overview
 * - https://github.com/clerk/javascript/blob/main/packages/backend/src/webhooks.ts
 */

import { z } from "zod";

// =============================================================================
// Email Address
// =============================================================================

/**
 * Email address object from Clerk.
 * Contains the email address and verification status.
 */
const EmailAddressSchema = z.object({
	id: z.string(),
	email_address: z.string(),
	verification: z
		.object({
			status: z.enum(["verified", "unverified", "expired"]),
			strategy: z.string().nullish(),
			attempts: z.number().nullish(),
			expireAt: z.number().nullish(),
		})
		.nullish(),
	reserved: z.boolean().nullish(),
});

// =============================================================================
// User Data
// =============================================================================

/**
 * Base user object from Clerk.
 * Only includes fields we care about or might use in the future.
 */
const UserDataBaseSchema = z.object({
	/** Clerk user ID - primary identifier */
	id: z.string(),
});

/**
 * User data with email information.
 * Used for user.created and user.updated events.
 *
 * Note: Clerk sends `null` for optional fields that are not set,
 * so we use `.nullish()` (null | undefined) instead of `.optional()`.
 */
const UserDataWithEmailSchema = UserDataBaseSchema.extend({
	/** Array of email addresses associated with the user */
	email_addresses: z.array(EmailAddressSchema),
	/** ID of the primary email address (use to find correct email in array) */
	primary_email_address_id: z.string().nullish(),
	/** User's first name */
	first_name: z.string().nullish(),
	/** User's last name */
	last_name: z.string().nullish(),
	/** User's profile image URL */
	image_url: z.string().nullish(),
	/** When the user was created (Unix timestamp) */
	created_at: z.number().nullish(),
	/** When the user was last updated (Unix timestamp) */
	updated_at: z.number().nullish(),
	/** Whether the user is banned */
	banned: z.boolean().nullish(),
	/** Whether the user has verified their email */
	locked: z.boolean().nullish(),
	/** External ID (if user was synced from external system) */
	external_id: z.string().nullish(),
});

/**
 * Minimal user data for user.deleted event.
 * Clerk only sends the user ID on deletion.
 */
const UserDataDeletedSchema = UserDataBaseSchema;

// =============================================================================
// Webhook Events
// =============================================================================

/**
 * Base webhook event schema.
 * All Clerk webhook events have a `type` and `data` field.
 */
const ClerkWebhookEventBaseSchema = z.object({
	/** Event type - discriminator for the union */
	type: z.string(),
	/** Timestamp when the event occurred (Unix milliseconds) */
	created_at: z.number().nullish(),
	/** Internal Clerk ID - not typically used */
	object: z.string().nullish(),
});

/**
 * user.created event.
 * Sent when a new user signs up.
 */
const UserCreatedEventSchema = ClerkWebhookEventBaseSchema.extend({
	type: z.literal("user.created"),
	data: UserDataWithEmailSchema,
});

/**
 * user.updated event.
 * Sent when a user's profile is modified.
 */
const UserUpdatedEventSchema = ClerkWebhookEventBaseSchema.extend({
	type: z.literal("user.updated"),
	data: UserDataWithEmailSchema,
});

/**
 * user.deleted event.
 * Sent when a user is deleted.
 * Note: Only contains user ID, not full user data.
 */
const UserDeletedEventSchema = ClerkWebhookEventBaseSchema.extend({
	type: z.literal("user.deleted"),
	data: UserDataDeletedSchema,
});

// =============================================================================
// Event Union
// =============================================================================

/**
 * All Clerk webhook events we handle.
 * Uses discriminated union on `type` field for type narrowing.
 */
export const ClerkWebhookEventSchema = z.discriminatedUnion("type", [
	UserCreatedEventSchema,
	UserUpdatedEventSchema,
	UserDeletedEventSchema,
]);

// =============================================================================
// Exported Types
// =============================================================================

export type ClerkWebhookEvent = z.infer<typeof ClerkWebhookEventSchema>;
export type UserCreatedEvent = z.infer<typeof UserCreatedEventSchema>;
export type UserUpdatedEvent = z.infer<typeof UserUpdatedEventSchema>;
export type UserDeletedEvent = z.infer<typeof UserDeletedEventSchema>;

export type EmailAddress = z.infer<typeof EmailAddressSchema>;
export type UserDataWithEmail = z.infer<typeof UserDataWithEmailSchema>;
export type UserDataDeleted = z.infer<typeof UserDataDeletedSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract the primary email address from a user data object.
 * Returns null if no primary email is found.
 *
 * @param user - User data with email_addresses array
 * @returns The primary email address string, or null if not found
 *
 * @example
 * ```typescript
 * const email = getPrimaryEmail(event.data);
 * if (!email) {
 *   throw new Error("No primary email found");
 * }
 * ```
 */
export function getPrimaryEmail(
	user: UserDataWithEmail,
): string | null {
	// If primary_email_address_id is present, find the matching email
	if (user.primary_email_address_id) {
		const primary = user.email_addresses.find(
			(e) => e.id === user.primary_email_address_id,
		);
		return primary?.email_address ?? null;
	}

	// Fallback: return first verified email, or first email if none verified
	const verified = user.email_addresses.find(
		(e) => e.verification?.status === "verified",
	);
	if (verified) {
		return verified.email_address;
	}

	// Last resort: return first email
	return user.email_addresses[0]?.email_address ?? null;
}
