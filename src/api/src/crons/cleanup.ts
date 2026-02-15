import { createDb, events } from '@/db';
import { and, lt, sql, isNull } from 'drizzle-orm';
import type { Bindings } from '../types';

interface CleanupResult {
	eventsSoftDeleted: number;
}

/**
 * Cleanup expired events (SOFT DELETE):
 * 1. Query expired events that haven't been soft-deleted yet
 * 2. Set deletedAt timestamp on expired events
 * 3. Events become invisible to all queries (children inherit deletion state)
 *
 * Runs daily at 3 AM Bangkok time (8 PM UTC)
 *
 * Note: Hard deletion (AWS Rekognition, R2 objects, DB records) is phase 2
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

	// Soft-delete expired events that haven't been deleted yet
	const result = await db
		.update(events)
		.set({ deletedAt: new Date().toISOString() })
		.where(
			and(
				lt(events.createdAt, sql`NOW() - INTERVAL '${sql.raw(retentionDays.toString())} days'`),
				lt(events.expiresAt, sql`NOW()`), // Expired
				isNull(events.deletedAt) // Not already soft-deleted
			)
		)
		.returning({ id: events.id });

	const eventsSoftDeleted = result.length;

	if (eventsSoftDeleted === 0) {
		console.log('[Cleanup] No events to soft-delete');
		return { eventsSoftDeleted: 0 };
	}

	const duration = Date.now() - startTime;

	console.log('[Cleanup] Cron completed', {
		eventsSoftDeleted,
		eventIds: result.map((e) => e.id),
		durationMs: duration,
	});

	return { eventsSoftDeleted };
}
