import { createDb, events } from '@sabaipics/db';
import { and, lt, sql } from 'drizzle-orm';
import type { Bindings } from '../types';

interface CleanupResult {
	eventsQueued: number;
}

/**
 * Cleanup expired events (LIGHTWEIGHT PRODUCER):
 * 1. Query expired events (max 10 per run)
 * 2. Send each event to CLEANUP_QUEUE for processing
 * 3. Queue consumer handles heavy lifting (soft-delete photos, delete AWS, update DB)
 *
 * Runs daily at 3 AM Bangkok time (8 PM UTC)
 */
export async function cleanupExpiredEvents(env: Bindings): Promise<CleanupResult> {
	const startTime = Date.now();
	const retentionDays = env.RETENTION_DAYS ? parseInt(env.RETENTION_DAYS, 10) : 30;
	const batchSize = env.CLEANUP_BATCH_SIZE ? parseInt(env.CLEANUP_BATCH_SIZE, 10) : 10;

	console.log('[Cleanup] Cron started', {
		timestamp: new Date().toISOString(),
		retentionDays,
		batchSize,
	});

	const db = createDb(env.DATABASE_URL);

	// Query expired events (don't filter by collectionId - let consumer handle all states)
	const expiredEvents = await db
		.select({
			id: events.id,
			collectionId: events.rekognitionCollectionId,
		})
		.from(events)
		.where(
			and(
				lt(events.createdAt, sql`NOW() - INTERVAL '${sql.raw(retentionDays.toString())} days'`),
				lt(events.expiresAt, sql`NOW()`) // Double-check expired
			)
		)
		.limit(batchSize);

	if (expiredEvents.length === 0) {
		console.log('[Cleanup] No events to queue');
		return {
			eventsQueued: 0,
		};
	}

	console.log('[Cleanup] Queuing expired events', {
		count: expiredEvents.length,
		eventIds: expiredEvents.map((e) => e.id),
	});

	// Send each event to cleanup queue
	for (const event of expiredEvents) {
		await env.CLEANUP_QUEUE.send({
			event_id: event.id,
			collection_id: event.collectionId,
		});
	}

	const duration = Date.now() - startTime;

	console.log('[Cleanup] Cron completed', {
		eventsQueued: expiredEvents.length,
		durationMs: duration,
	});

	return {
		eventsQueued: expiredEvents.length,
	};
}
