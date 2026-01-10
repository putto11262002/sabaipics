/**
 * Clerk Webhook Event Schemas
 *
 * Zod schemas for validating and typing Clerk webhook events.
 * Based on official Clerk types from @clerk/types.
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
 * - https://clerk.com/docs/webhooks/sync-data
 * - @clerk/types UserJSON interface
 */

import { z } from "zod";

// =============================================================================
// Verification
// =============================================================================

/**
 * Verification object from Clerk.
 * Based on VerificationJSON from @clerk/types.
 */
const VerificationSchema = z.object({
	status: z.string(),
	strategy: z.string(),
	attempts: z.number().nullable(),
	expire_at: z.number().nullable(),
	verified_at_client: z.string().optional(),
	nonce: z.string().optional().nullable(),
	message: z.string().optional().nullable(),
	external_verification_redirect_url: z.string().optional().nullable(),
	error: z.any().optional().nullable(),
});

// =============================================================================
// Email Address
// =============================================================================

/**
 * Email address object from Clerk.
 * Based on EmailAddressJSON from @clerk/types.
 */
const EmailAddressSchema = z.object({
	object: z.literal("email_address").optional(),
	id: z.string(),
	email_address: z.string(),
	verification: VerificationSchema.nullable(),
	linked_to: z.array(z.object({
		id: z.string(),
		type: z.string(),
	})).optional(),
	reserved: z.boolean().optional(),
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
 * Based on UserJSON from @clerk/types.
 *
 * Note: Clerk uses `| null` for optional fields, not undefined.
 * We use `.nullable()` to match this behavior.
 */
const UserDataWithEmailSchema = UserDataBaseSchema.extend({
	/** Object type */
	object: z.literal("user").optional(),
	/** Array of email addresses associated with the user */
	email_addresses: z.array(EmailAddressSchema),
	/** ID of the primary email address */
	primary_email_address_id: z.string().nullable(),
	/** User's first name */
	first_name: z.string().nullable(),
	/** User's last name */
	last_name: z.string().nullable(),
	/** User's username */
	username: z.string().nullable().optional(),
	/** User's profile image URL */
	image_url: z.string().optional(),
	/** Whether the user has a profile image */
	has_image: z.boolean().optional(),
	/** External ID (if user was synced from external system) */
	external_id: z.string().nullable(),
	/** When the user was created (Unix timestamp ms) */
	created_at: z.number(),
	/** When the user was last updated (Unix timestamp ms) */
	updated_at: z.number(),
	/** When the user last signed in */
	last_sign_in_at: z.number().nullable().optional(),
	/** Whether the user is banned */
	banned: z.boolean().optional(),
	/** Whether the user is locked */
	locked: z.boolean().optional(),
	/** Whether password is enabled */
	password_enabled: z.boolean().optional(),
	/** Whether two factor is enabled */
	two_factor_enabled: z.boolean().optional(),
	/** Whether TOTP is enabled */
	totp_enabled: z.boolean().optional(),
	/** Whether backup codes are enabled */
	backup_code_enabled: z.boolean().optional(),
	/** Public metadata */
	public_metadata: z.record(z.unknown()).optional(),
	/** Unsafe metadata */
	unsafe_metadata: z.record(z.unknown()).optional(),
	/** Private metadata (only in some contexts) */
	private_metadata: z.record(z.unknown()).optional(),
}).passthrough(); // Allow additional fields we don't explicitly define

/**
 * Minimal user data for user.deleted event.
 * Clerk only sends the user ID on deletion.
 */
const UserDataDeletedSchema = UserDataBaseSchema.extend({
	object: z.literal("user").optional(),
	deleted: z.boolean().optional(),
}).passthrough();

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
	/** Event object type */
	object: z.string().optional(),
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
