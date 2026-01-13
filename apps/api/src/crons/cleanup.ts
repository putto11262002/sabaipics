import { createDb, events, photos } from '@sabaipics/db';
import { and, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { createRekognitionClient, deleteCollection } from '../lib/rekognition/client';
import type { Bindings } from '../types';

interface CleanupResult {
	totalProcessed: number;
	successCount: number;
	failureCount: number;
	photosDeleted: number;
}

/**
 * Cleanup expired events:
 * 1. Soft-delete all photos for events older than 30 days
 * 2. Delete Rekognition collections from AWS
 * 3. Clear rekognitionCollectionId from event records
 *
 * Runs daily at 3 AM Bangkok time (8 PM UTC)
 */
export async function cleanupExpiredEvents(env: Bindings): Promise<CleanupResult> {
	const startTime = Date.now();
	const retentionDays = env.RETENTION_DAYS ? parseInt(env.RETENTION_DAYS, 10) : 30;
	const batchSize = env.CLEANUP_BATCH_SIZE ? parseInt(env.CLEANUP_BATCH_SIZE, 10) : 10;

	console.log('[Cleanup] Job started', {
		timestamp: new Date().toISOString(),
		retentionDays,
		batchSize,
	});

	const db = createDb(env.DATABASE_URL);
	const rekognitionClient = createRekognitionClient({
		AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
		AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
		AWS_REGION: env.AWS_REGION,
	});

	// Step 1: Query expired events with collections
	const expiredEvents = await db
		.select({
			id: events.id,
			name: events.name,
			collectionId: events.rekognitionCollectionId,
			createdAt: events.createdAt,
		})
		.from(events)
		.where(
			and(
				lt(events.createdAt, sql`NOW() - INTERVAL '${sql.raw(retentionDays.toString())} days'`),
				isNotNull(events.rekognitionCollectionId),
				lt(events.expiresAt, sql`NOW()`) // Double-check expired
			)
		)
		.limit(batchSize);

	if (expiredEvents.length === 0) {
		console.log('[Cleanup] No events to process');
		return {
			totalProcessed: 0,
			successCount: 0,
			failureCount: 0,
			photosDeleted: 0,
		};
	}

	console.log('[Cleanup] Found expired events', {
		count: expiredEvents.length,
		eventIds: expiredEvents.map((e) => e.id),
	});

	// Step 2: Batch soft-delete all photos for these events
	const eventIds = expiredEvents.map((e) => e.id);
	const deletedPhotos = await db
		.update(photos)
		.set({ deletedAt: new Date().toISOString() })
		.where(
			and(
				inArray(photos.eventId, eventIds),
				isNull(photos.deletedAt) // Only delete non-deleted photos
			)
		)
		.returning({ id: photos.id });

	console.log('[Cleanup] Soft-deleted photos', {
		count: deletedPhotos.length,
	});

	// Step 3: Delete collections in parallel
	const deletionResults = await Promise.allSettled(
		expiredEvents.map((event) =>
			deleteCollection(rekognitionClient, event.id)
				.then(() => ({
					eventId: event.id,
					eventName: event.name,
					collectionId: event.collectionId,
					status: 'success' as const,
					note: undefined,
				}))
				.catch((err: unknown) => {
					// Handle ResourceNotFoundException as success (idempotent)
					const error = err as { name?: string; message?: string };
					if (error.name === 'ResourceNotFoundException') {
						return {
							eventId: event.id,
							eventName: event.name,
							collectionId: event.collectionId,
							status: 'success' as const,
							note: 'already_deleted' as const,
						};
					}

					return {
						eventId: event.id,
						eventName: event.name,
						collectionId: event.collectionId,
						status: 'failed' as const,
						error: error.name ?? 'UnknownError',
						errorMessage: error.message ?? String(err),
					};
				})
		)
	);

	// Count successes and failures
	let successCount = 0;
	let failureCount = 0;

	for (const result of deletionResults) {
		if (result.status === 'fulfilled') {
			const deleteResult = result.value;
			if (deleteResult.status === 'success') {
				successCount++;
				console.log('[Cleanup] Deleted collection', {
					eventId: deleteResult.eventId,
					eventName: deleteResult.eventName,
					collectionId: deleteResult.collectionId,
					note: deleteResult.note,
				});
			} else {
				failureCount++;
				console.error('[Cleanup] Failed to delete collection', {
					eventId: deleteResult.eventId,
					eventName: deleteResult.eventName,
					collectionId: deleteResult.collectionId,
					error: deleteResult.error,
					errorMessage: deleteResult.errorMessage,
				});
			}
		} else {
			// Promise.allSettled rejection (shouldn't happen with our catch)
			failureCount++;
			console.error('[Cleanup] Unexpected deletion failure', {
				reason: result.reason,
			});
		}
	}

	// Step 4: Batch update events to clear collection IDs (even for failures - idempotent)
	await db
		.update(events)
		.set({ rekognitionCollectionId: null })
		.where(inArray(events.id, eventIds));

	const duration = Date.now() - startTime;

	console.log('[Cleanup] Job completed', {
		totalProcessed: expiredEvents.length,
		successCount,
		failureCount,
		photosDeleted: deletedPhotos.length,
		durationMs: duration,
	});

	return {
		totalProcessed: expiredEvents.length,
		successCount,
		failureCount,
		photosDeleted: deletedPhotos.length,
	};
}
