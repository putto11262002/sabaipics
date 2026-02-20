import { createDb, uploadIntents } from '@/db';
import { and, eq, lt, isNull } from 'drizzle-orm';
import type { Bindings } from '../types';

const BATCH_SIZE = 100;

/**
 * Deletes the **original** R2 upload object for completed intents older than 1 day.
 * The normalized JPEG ({eventId}/{photoId}.jpg) is NOT touched.
 * The intent record is kept as a successful audit trail.
 *
 * Schedule: 0 23 * * * (6 AM Bangkok)
 */
export async function cleanupCompletedOriginals(env: Bindings): Promise<void> {
	const startTime = Date.now();
	const db = createDb(env.DATABASE_URL);

	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 1);

	const intents = await db
		.select({ id: uploadIntents.id, r2Key: uploadIntents.r2Key })
		.from(uploadIntents)
		.where(
			and(
				eq(uploadIntents.status, 'completed'),
				isNull(uploadIntents.r2CleanedAt),
				lt(uploadIntents.createdAt, cutoff.toISOString()),
			),
		)
		.limit(BATCH_SIZE);

	if (intents.length === 0) {
		console.log('[UploadIntentCleanup] No completed originals to clean up');
		return;
	}

	let deleted = 0;
	let failed = 0;

	for (const intent of intents) {
		try {
			// Delete original R2 object (idempotent — no-op if already gone)
			await env.PHOTOS_BUCKET.delete(intent.r2Key);

			// Mark as cleaned so we don't re-process on next cron run
			await db
				.update(uploadIntents)
				.set({ r2CleanedAt: new Date().toISOString() })
				.where(eq(uploadIntents.id, intent.id));

			deleted++;
		} catch (error) {
			failed++;
			console.error('[UploadIntentCleanup] Failed to clean completed original', {
				intentId: intent.id,
				r2Key: intent.r2Key,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	console.log('[UploadIntentCleanup] Completed originals cleanup done', {
		processed: intents.length,
		deleted,
		failed,
		durationMs: Date.now() - startTime,
	});
}
