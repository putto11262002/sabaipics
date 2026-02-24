import { createDbTx, events } from '@/db';
import { and, lt, isNotNull } from 'drizzle-orm';
import type { Bindings } from '../types';
import { hardDeleteEvents } from '../lib/services/events/hard-delete';

interface HardDeleteCleanupResult {
	eventsHardDeleted: number;
	eventIds: string[];
}

/**
 * Hard Delete Cleanup (PERMANENT DELETE):
 * 1. Query soft-deleted events older than grace period (default: 30 days)
 * 2. Permanently delete events and all related data:
 *    - Database records (face_embeddings cascade, faces, photos, searches, uploads, ftp, events)
 *    - R2 objects (photos, logos, QR codes, selfies)
 * 3. Process in batches to avoid timeouts
 *
 * Runs daily at 3 AM Bangkok time (8 PM UTC)
 *
 * WARNING: This is irreversible. Events are permanently deleted after the grace period.
 */
export async function hardDeleteCleanup(env: Bindings): Promise<HardDeleteCleanupResult> {
	const startTime = Date.now();
	const graceDays = env.HARD_DELETE_GRACE_DAYS ? parseInt(env.HARD_DELETE_GRACE_DAYS, 10) : 30;
	const batchSize = env.HARD_DELETE_BATCH_SIZE ? parseInt(env.HARD_DELETE_BATCH_SIZE, 10) : 5;

	console.log('[HardDeleteCleanup] Cron started', {
		timestamp: new Date().toISOString(),
		graceDays,
		batchSize,
	});

	const db = createDbTx(env.DATABASE_URL);

	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - graceDays);

	const candidates = await db
		.select({ id: events.id })
		.from(events)
		.where(
			and(
				isNotNull(events.deletedAt),
				lt(events.deletedAt, cutoffDate.toISOString())
			)
		)
		.limit(batchSize);

	if (candidates.length === 0) {
		console.log('[HardDeleteCleanup] No events to hard-delete');
		return { eventsHardDeleted: 0, eventIds: [] };
	}

	const eventIds = candidates.map((e) => e.id);

	console.log('[HardDeleteCleanup] Found candidates for hard deletion', {
		count: eventIds.length,
		eventIds,
	});

	const result = await hardDeleteEvents({
		db,
		eventIds,
		r2Bucket: env.PHOTOS_BUCKET,
	});

	return result.match(
		(results) => {
			const successes = results.filter((r) => r.success);
			const failures = results.filter((r) => !r.success);
			const duration = Date.now() - startTime;

			if (failures.length > 0) {
				console.error('[HardDeleteCleanup] Partial failures', {
					succeeded: successes.length,
					failed: failures.length,
					failedEventIds: failures.map((r) => r.eventId),
					errors: failures.map((r) => ({
						eventId: r.eventId,
						error: r.error,
					})),
					durationMs: duration,
				});
			}

			if (successes.length > 0) {
				console.log('[HardDeleteCleanup] Cron completed', {
					eventsHardDeleted: successes.length,
					eventIds: successes.map((r) => r.eventId),
					durationMs: duration,
					details: successes.map((r) => ({
						eventId: r.eventId,
						deleted: r.deleted,
					})),
				});
			}

			if (successes.length === 0 && failures.length > 0) {
				throw new Error(
					`All deletions failed: ${failures.length} events failed to delete`
				);
			}

			return {
				eventsHardDeleted: successes.length,
				eventIds: successes.map((r) => r.eventId),
			};
		},
		(error) => {
			const duration = Date.now() - startTime;
			console.error('[HardDeleteCleanup] Cron failed completely', {
				error,
				eventIds,
				durationMs: duration,
			});

			throw new Error(`Hard delete cleanup failed: ${error.type}`);
		}
	);
}
