/**
 * Generic Service Error Types
 *
 * Shared error types for all services following neverthrow Result pattern.
 * Provides discriminated union for type-safe error handling across services.
 *
 * Pattern inspired by lib/rekognition/errors.ts
 */

/**
 * Generic Service Error - discriminated union for typed error handling.
 *
 * TContext allows service-specific context (e.g., { eventId: string } for events)
 * All errors include retryable flag for consumer retry logic.
 */
export type ServiceError<TContext = unknown> =
	// Domain errors (not retryable)
	| {
			type: 'not_found';
			resource: string; // e.g., 'event', 'user', 'photo'
			id: string;
			retryable: false;
			context?: TContext;
	  }
	| {
			type: 'invalid_input';
			field: string;
			reason: string;
			retryable: false;
			context?: TContext;
	  }
	| {
			type: 'already_exists';
			resource: string;
			id: string;
			retryable: false;
			context?: TContext;
	  }

	// Storage errors (R2, S3, etc.) - retryable
	| {
			type: 'storage_failed';
			operation: string; // e.g., 'delete', 'upload', 'get'
			retryable: true;
			cause: unknown;
			context?: TContext;
	  }

	// Database errors - retryable
	| {
			type: 'database';
			operation: string; // e.g., 'insert', 'update', 'delete', 'transaction'
			retryable: true;
			cause: unknown;
			context?: TContext;
	  }

	// External provider errors - retryability depends on provider
	| {
			type: 'provider_failed';
			provider: string; // e.g., 'aws', 'rekognition', 'stripe'
			operation: string;
			retryable: boolean;
			throttle?: boolean; // For rate-limited errors
			cause: unknown;
			context?: TContext;
	  }

	// Custom/domain-specific errors - flexible for service-specific needs
	| {
			type: 'custom';
			code: string; // e.g., 'EVENT_NOT_SOFT_DELETED', 'INSUFFICIENT_CREDITS'
			message: string;
			retryable: boolean;
			context?: TContext;
	  };

// =============================================================================
// Service-Specific Error Type Aliases
// =============================================================================

/**
 * Event Service Errors
 * Context includes eventId for all event-related operations
 */
export type EventServiceError = ServiceError<{ eventId: string }>;

/**
 * Upload Service Errors
 * Context includes uploadId for upload-related operations
 */
export type UploadServiceError = ServiceError<{ uploadId: string }>;

/**
 * Photo Service Errors
 * Context includes photoId for photo-related operations
 */
export type PhotoServiceError = ServiceError<{ photoId: string }>;

// =============================================================================
// Error Constructor Helpers
// =============================================================================

/**
 * Create a not_found error
 */
export function notFound<TContext>(
	resource: string,
	id: string,
	context?: TContext
): ServiceError<TContext> {
	return { type: 'not_found', resource, id, retryable: false, context };
}

/**
 * Create an invalid_input error
 */
export function invalidInput<TContext>(
	field: string,
	reason: string,
	context?: TContext
): ServiceError<TContext> {
	return { type: 'invalid_input', field, reason, retryable: false, context };
}

/**
 * Create a storage_failed error
 */
export function storageFailed<TContext>(
	operation: string,
	cause: unknown,
	context?: TContext
): ServiceError<TContext> {
	return { type: 'storage_failed', operation, retryable: true, cause, context };
}

/**
 * Create a database error
 */
export function databaseError<TContext>(
	operation: string,
	cause: unknown,
	context?: TContext
): ServiceError<TContext> {
	return { type: 'database', operation, retryable: true, cause, context };
}

/**
 * Create a provider_failed error
 */
export function providerFailed<TContext>(
	provider: string,
	operation: string,
	retryable: boolean,
	cause: unknown,
	context?: TContext,
	throttle?: boolean
): ServiceError<TContext> {
	return { type: 'provider_failed', provider, operation, retryable, throttle, cause, context };
}

/**
 * Create a custom error
 */
export function customError<TContext>(
	code: string,
	message: string,
	retryable: boolean,
	context?: TContext
): ServiceError<TContext> {
	return { type: 'custom', code, message, retryable, context };
}
