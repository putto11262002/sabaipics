import { createDb, uploadIntents, photos } from '@/db';
import { and, eq, lt, or, isNull } from 'drizzle-orm';
import type { Bindings } from '../types';

const BATCH_SIZE = 100;

// =============================================================================
// Cron 1: Completed intent original R2 cleanup (1 day)
// =============================================================================

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

// =============================================================================
// Cron 2: Non-retryable failed cleanup (3 days)
// =============================================================================

/**
 * Hard deletes non-retryable failed and expired upload intents older than 3 days.
 * Removes: R2 object + associated photo record (if any) + upload intent record.
 *
 * Schedule: 10 23 * * * (6:10 AM Bangkok)
 */
export async function cleanupNonRetryableFailed(env: Bindings): Promise<void> {
	const startTime = Date.now();
	const db = createDb(env.DATABASE_URL);

	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 3);

	const intents = await db
		.select({
			id: uploadIntents.id,
			r2Key: uploadIntents.r2Key,
			photoId: uploadIntents.photoId,
		})
		.from(uploadIntents)
		.where(
			and(
				or(
					// Non-retryable failures
					and(eq(uploadIntents.status, 'failed'), eq(uploadIntents.retryable, false)),
					// Expired intents
					eq(uploadIntents.status, 'expired'),
				),
				lt(uploadIntents.createdAt, cutoff.toISOString()),
			),
		)
		.limit(BATCH_SIZE);

	if (intents.length === 0) {
		console.log('[UploadIntentCleanup] No non-retryable failed intents to clean up');
		return;
	}

	let deleted = 0;
	let failed = 0;

	for (const intent of intents) {
		try {
			// Delete R2 object (best-effort — may already be gone)
			if (intent.r2Key) {
				await env.PHOTOS_BUCKET.delete(intent.r2Key).catch(() => {});
			}

			// Delete associated photo record if any
			if (intent.photoId) {
				await db.delete(photos).where(eq(photos.id, intent.photoId)).catch(() => {});
			}

			// Delete the upload intent record
			await db.delete(uploadIntents).where(eq(uploadIntents.id, intent.id));

			deleted++;
		} catch (error) {
			failed++;
			console.error('[UploadIntentCleanup] Failed to clean non-retryable intent', {
				intentId: intent.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	console.log('[UploadIntentCleanup] Non-retryable failed cleanup done', {
		processed: intents.length,
		deleted,
		failed,
		durationMs: Date.now() - startTime,
	});
}

// =============================================================================
// Cron 3: Stale retryable cleanup (7 days)
// =============================================================================

/**
 * Hard deletes retryable failed upload intents older than 7 days.
 * These are intents (e.g. insufficient_credits) that the user never acted on.
 * Removes: R2 object + associated photo record (if any) + upload intent record.
 *
 * Schedule: 20 23 * * * (6:20 AM Bangkok)
 */
export async function cleanupStaleRetryable(env: Bindings): Promise<void> {
	const startTime = Date.now();
	const db = createDb(env.DATABASE_URL);

	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 7);

	const intents = await db
		.select({
			id: uploadIntents.id,
			r2Key: uploadIntents.r2Key,
			photoId: uploadIntents.photoId,
		})
		.from(uploadIntents)
		.where(
			and(
				eq(uploadIntents.status, 'failed'),
				eq(uploadIntents.retryable, true),
				lt(uploadIntents.createdAt, cutoff.toISOString()),
			),
		)
		.limit(BATCH_SIZE);

	if (intents.length === 0) {
		console.log('[UploadIntentCleanup] No stale retryable intents to clean up');
		return;
	}

	let deleted = 0;
	let failed = 0;

	for (const intent of intents) {
		try {
			// Delete R2 object (best-effort)
			if (intent.r2Key) {
				await env.PHOTOS_BUCKET.delete(intent.r2Key).catch(() => {});
			}

			// Delete associated photo record if any
			if (intent.photoId) {
				await db.delete(photos).where(eq(photos.id, intent.photoId)).catch(() => {});
			}

			// Delete the upload intent record
			await db.delete(uploadIntents).where(eq(uploadIntents.id, intent.id));

			deleted++;
		} catch (error) {
			failed++;
			console.error('[UploadIntentCleanup] Failed to clean stale retryable intent', {
				intentId: intent.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	console.log('[UploadIntentCleanup] Stale retryable cleanup done', {
		processed: intents.length,
		deleted,
		failed,
		durationMs: Date.now() - startTime,
	});
}

// =============================================================================
// Cron 4: Expire stale pending intents (7 days)
// =============================================================================

/**
 * Transitions stale pending upload intents to `expired` after 7 days.
 * Covers two stuck scenarios:
 *   (a) Worker crash — error handler never ran, intent stuck in `pending`
 *   (b) Client got presign but never uploaded — no R2 event fired
 *
 * Uses `createdAt` (not `expiresAt`) because clients can re-presign a pending
 * intent days later via POST /uploads/:uploadId/presign, resetting expiry.
 *
 * Hard deletion of the expired intent + R2 object is handled by Cron 2
 * (cleanupNonRetryableFailed) after 3 more days.
 *
 * Schedule: 30 23 * * * (6:30 AM Bangkok)
 */
export async function expireStalePendingIntents(env: Bindings): Promise<void> {
	const startTime = Date.now();
	const db = createDb(env.DATABASE_URL);

	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 7);

	const intents = await db
		.select({ id: uploadIntents.id })
		.from(uploadIntents)
		.where(
			and(
				eq(uploadIntents.status, 'pending'),
				lt(uploadIntents.createdAt, cutoff.toISOString()),
			),
		)
		.limit(BATCH_SIZE);

	if (intents.length === 0) {
		console.log('[UploadIntentCleanup] No stale pending intents to expire');
		return;
	}

	let expired = 0;
	let failed = 0;

	for (const intent of intents) {
		try {
			await db
				.update(uploadIntents)
				.set({ status: 'expired' })
				.where(eq(uploadIntents.id, intent.id));

			expired++;
		} catch (error) {
			failed++;
			console.error('[UploadIntentCleanup] Failed to expire stale pending intent', {
				intentId: intent.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	console.log('[UploadIntentCleanup] Stale pending expiry done', {
		processed: intents.length,
		expired,
		failed,
		durationMs: Date.now() - startTime,
	});
}
