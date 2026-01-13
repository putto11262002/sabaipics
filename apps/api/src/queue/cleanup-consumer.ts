/**
 * Cleanup Queue Consumer
 *
 * Handles rekognition-cleanup queue messages with:
 * - State-based cleanup (check before action)
 * - Idempotent operations (can run multiple times safely)
 * - Per-message ack/retry based on individual results
 * - ResourceNotFoundException handling (already deleted → success)
 *
 * Cleanup operations (determined by state):
 * 1. Soft-delete photos (set deletedAt timestamp)
 * 2. Delete Rekognition collection from AWS
 * 3. Clear rekognitionCollectionId from event record
 */

import type { CleanupJob } from '../types/cleanup-job';
import type { Bindings } from '../types';
import { createDb, events, photos, type Database } from '@sabaipics/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { createRekognitionClient, deleteCollection } from '../lib/rekognition/client';
import { RekognitionClient } from '@aws-sdk/client-rekognition';
import { ResultAsync, ok, err, type Result } from 'neverthrow';
import { getBackoffDelay, getThrottleBackoffDelay } from '../lib/rekognition/errors';

// =============================================================================
// Types
// =============================================================================

/**
 * Current state of an event for cleanup purposes.
 */
interface EventCleanupState {
	hasPhotos: boolean;
	hasPhotosNotDeleted: boolean;
	collectionId: string | null;
}

/**
 * Actions to perform based on state.
 */
type CleanupAction = 'soft_delete' | 'delete_collection' | 'update_event';

/**
 * Summary of cleanup operations performed.
 */
interface CleanupSummary {
	eventId: string;
	actionsPerformed: CleanupAction[];
	photosDeleted: number;
	collectionDeleted: boolean;
	eventUpdated: boolean;
}

/**
 * Cleanup-specific error with retry information.
 */
class CleanupError extends Error {
	retryable: boolean;
	isThrottle: boolean;
	name: string;

	constructor(
		message: string,
		options: {
			name: string;
			retryable: boolean;
			isThrottle?: boolean;
			cause?: unknown;
		},
	) {
		super(message);
		this.name = options.name;
		this.retryable = options.retryable;
		this.isThrottle = options.isThrottle ?? false;
		this.cause = options.cause;
	}
}

// =============================================================================
// State Checking
// =============================================================================

/**
 * Query current state of event to determine what cleanup actions are needed.
 *
 * Returns state indicating:
 * - hasPhotos: Any photos exist for this event
 * - hasPhotosNotDeleted: Any photos not yet soft-deleted
 * - collectionId: Rekognition collection ID (null if already deleted)
 */
async function getEventState(
	db: Database,
	eventId: string,
): Promise<Result<EventCleanupState, CleanupError>> {
	try {
		const state = await db
			.select({
				hasPhotos: sql<boolean>`EXISTS(SELECT 1 FROM ${photos} WHERE ${photos.eventId} = ${eventId})`,
				hasPhotosNotDeleted: sql<boolean>`EXISTS(SELECT 1 FROM ${photos} WHERE ${photos.eventId} = ${eventId} AND ${photos.deletedAt} IS NULL)`,
				collectionId: events.rekognitionCollectionId,
			})
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1)
			.then((rows) => rows[0]);

		if (!state) {
			return err(
				new CleanupError(`Event not found: ${eventId}`, {
					name: 'EventNotFound',
					retryable: false,
				}),
			);
		}

		return ok(state);
	} catch (error) {
		return err(
			new CleanupError(`Failed to query event state: ${String(error)}`, {
				name: 'DatabaseError',
				retryable: true,
				cause: error,
			}),
		);
	}
}

/**
 * Determine which cleanup actions to perform based on current state.
 *
 * Logic:
 * - If photos exist and not deleted → soft_delete
 * - If collectionId exists → delete_collection + update_event
 * - If both are already done → empty array (skip processing)
 */
function determineActions(state: EventCleanupState): CleanupAction[] {
	const actions: CleanupAction[] = [];

	if (state.hasPhotosNotDeleted) {
		actions.push('soft_delete');
	}

	if (state.collectionId !== null) {
		actions.push('delete_collection', 'update_event');
	}

	return actions;
}

// =============================================================================
// Cleanup Operations
// =============================================================================

/**
 * Soft-delete all photos for an event (set deletedAt timestamp).
 * Idempotent: Only updates photos where deletedAt IS NULL.
 *
 * Returns number of photos deleted.
 */
async function softDeletePhotos(
	db: Database,
	eventId: string,
): Promise<Result<number, CleanupError>> {
	try {
		const deletedPhotos = await db
			.update(photos)
			.set({ deletedAt: new Date().toISOString() })
			.where(and(eq(photos.eventId, eventId), isNull(photos.deletedAt)))
			.returning({ id: photos.id });

		return ok(deletedPhotos.length);
	} catch (error) {
		return err(
			new CleanupError(`Failed to soft-delete photos: ${String(error)}`, {
				name: 'DatabaseError',
				retryable: true,
				cause: error,
			}),
		);
	}
}

/**
 * Delete Rekognition collection from AWS.
 * Handles ResourceNotFoundException as success (already deleted).
 *
 * Returns true if collection was deleted, false if already deleted.
 */
function deleteAwsCollection(
	client: RekognitionClient,
	eventId: string,
): ResultAsync<boolean, CleanupError> {
	return ResultAsync.fromPromise(
		deleteCollection(client, eventId),
		(e: unknown) => {
			const error = e as { name?: string; message?: string };
			const errorName = error.name ?? 'UnknownError';

			// Determine if retryable
			const retryable = ['ThrottlingException', 'ServiceUnavailableException'].includes(
				errorName,
			);
			const isThrottle = errorName === 'ThrottlingException';

			return new CleanupError(error.message ?? 'Failed to delete AWS collection', {
				name: errorName,
				retryable,
				isThrottle,
				cause: e,
			});
		},
	)
		.map(() => true) // Successfully deleted
		.orElse((error) => {
			// Remap ResourceNotFoundException to success (idempotent)
			if (error.name === 'ResourceNotFoundException') {
				console.log('[Cleanup] Collection already deleted (ResourceNotFoundException)', {
					eventId,
				});
				return ok(false); // Already deleted
			}
			return err(error); // Propagate other errors
		});
}

/**
 * Clear rekognitionCollectionId from event record.
 * Idempotent: Sets to NULL regardless of current value.
 */
async function updateEventRecord(
	db: Database,
	eventId: string,
): Promise<Result<void, CleanupError>> {
	try {
		await db
			.update(events)
			.set({ rekognitionCollectionId: null })
			.where(eq(events.id, eventId));

		return ok(undefined);
	} catch (error) {
		return err(
			new CleanupError(`Failed to update event record: ${String(error)}`, {
				name: 'DatabaseError',
				retryable: true,
				cause: error,
			}),
		);
	}
}

// =============================================================================
// Main Cleanup Logic
// =============================================================================

/**
 * Execute cleanup for a single event.
 * Performs actions based on current state (idempotent).
 *
 * Steps:
 * 1. Check state (what needs to be done?)
 * 2. Determine actions (based on state)
 * 3. Execute actions (soft-delete, delete AWS, update DB)
 * 4. Return summary
 */
async function executeCleanup(
	db: Database,
	client: RekognitionClient,
	eventId: string,
): Promise<Result<CleanupSummary, CleanupError>> {
	console.log('[Cleanup] Starting cleanup for event', { eventId });

	// Step 1: Check state
	const stateResult = await getEventState(db, eventId);
	if (stateResult.isErr()) {
		return err(stateResult.error);
	}

	const state = stateResult.value;
	console.log('[Cleanup] Event state', {
		eventId,
		hasPhotos: state.hasPhotos,
		hasPhotosNotDeleted: state.hasPhotosNotDeleted,
		collectionId: state.collectionId,
	});

	// Step 2: Determine actions
	const actions = determineActions(state);

	if (actions.length === 0) {
		console.log('[Cleanup] No actions needed (already complete)', { eventId });
		return ok({
			eventId,
			actionsPerformed: [],
			photosDeleted: 0,
			collectionDeleted: false,
			eventUpdated: false,
		});
	}

	console.log('[Cleanup] Actions to perform', { eventId, actions });

	// Step 3: Execute actions
	const summary: CleanupSummary = {
		eventId,
		actionsPerformed: [],
		photosDeleted: 0,
		collectionDeleted: false,
		eventUpdated: false,
	};

	// Action: Soft-delete photos
	if (actions.includes('soft_delete')) {
		const deleteResult = await softDeletePhotos(db, eventId);
		if (deleteResult.isErr()) {
			return err(deleteResult.error);
		}

		summary.photosDeleted = deleteResult.value;
		summary.actionsPerformed.push('soft_delete');

		console.log('[Cleanup] Soft-deleted photos', {
			eventId,
			count: summary.photosDeleted,
		});
	}

	// Action: Delete AWS collection
	if (actions.includes('delete_collection')) {
		const awsResult = await deleteAwsCollection(client, eventId);
		if (awsResult.isErr()) {
			return err(awsResult.error);
		}

		summary.collectionDeleted = awsResult.value;
		summary.actionsPerformed.push('delete_collection');

		console.log('[Cleanup] AWS collection deleted', {
			eventId,
			wasDeleted: summary.collectionDeleted,
		});
	}

	// Action: Update event record
	if (actions.includes('update_event')) {
		const updateResult = await updateEventRecord(db, eventId);
		if (updateResult.isErr()) {
			return err(updateResult.error);
		}

		summary.eventUpdated = true;
		summary.actionsPerformed.push('update_event');

		console.log('[Cleanup] Event record updated', { eventId });
	}

	return ok(summary);
}

// =============================================================================
// Queue Handler
// =============================================================================

/**
 * Queue consumer handler for cleanup processing.
 *
 * Processes each message independently with state-based cleanup:
 * - Check state → Determine actions → Execute → Ack or Retry
 * - Handles partial failures gracefully (idempotent operations)
 * - Uses exponential backoff for retries
 * - Longer backoff for throttling errors
 */
export async function queue(
	batch: MessageBatch<CleanupJob>,
	env: Bindings,
): Promise<void> {
	if (batch.messages.length === 0) {
		return;
	}

	console.log('[Cleanup] Starting batch processing', {
		batchSize: batch.messages.length,
		messages: batch.messages.map((m) => ({
			eventId: m.body.event_id,
			collectionId: m.body.collection_id,
		})),
	});

	// Create database connection once for entire batch
	const db = createDb(env.DATABASE_URL);

	// Create Rekognition client once for entire batch
	const client = createRekognitionClient({
		AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
		AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
		AWS_REGION: env.AWS_REGION,
	});

	// Process each message independently
	for (const message of batch.messages) {
		const { event_id } = message.body;

		console.log('[Cleanup] Processing message', {
			eventId: event_id,
			attempt: message.attempts,
		});

		// Execute cleanup
		const result = await executeCleanup(db, client, event_id);

		// Handle result with ack/retry
		result.match(
			(summary) => {
				console.log('[Cleanup] Success', {
					eventId: event_id,
					actionsPerformed: summary.actionsPerformed,
					photosDeleted: summary.photosDeleted,
					collectionDeleted: summary.collectionDeleted,
					eventUpdated: summary.eventUpdated,
				});
				message.ack();
			},
			(error) => {
				console.error('[Cleanup] Failed', {
					eventId: event_id,
					errorName: error.name,
					errorMessage: error.message,
					retryable: error.retryable,
					isThrottle: error.isThrottle,
				});

				// Non-retryable: ack and move to DLQ
				if (!error.retryable) {
					console.log('[Cleanup] Non-retryable error, acking (will go to DLQ)', {
						eventId: event_id,
					});
					message.ack();
					return;
				}

				// Retryable: retry with appropriate backoff
				if (error.isThrottle) {
					const delay = getThrottleBackoffDelay(message.attempts);
					console.log('[Cleanup] Throttle error, retrying with longer backoff', {
						eventId: event_id,
						delaySeconds: delay,
					});
					message.retry({ delaySeconds: delay });
				} else {
					const delay = getBackoffDelay(message.attempts);
					console.log('[Cleanup] Retryable error, retrying with exponential backoff', {
						eventId: event_id,
						delaySeconds: delay,
					});
					message.retry({ delaySeconds: delay });
				}
			},
		);
	}

	console.log('[Cleanup] Batch processing complete', {
		batchSize: batch.messages.length,
	});
}
