import {
	createDbTx,
	photographers,
	events,
	uploadIntents,
	logoUploadIntents,
	ftpCredentials,
	lineDeliveries,
	photoLuts,
	feedback,
} from '@/db';
import { and, lt, isNotNull, isNull, eq } from 'drizzle-orm';
import type { Bindings } from '../types';
import { hardDeleteEvents } from '../lib/services/events/hard-delete';
import { createStripeClient } from '../lib/stripe/client';

interface PhotographerCleanupResult {
	photographersProcessed: number;
	photographerIds: string[];
	eventsDeleted: number;
}

/**
 * Photographer Data Cleanup (Content Deletion, Audit Retention):
 *
 * This cron job cleans up personal/operational data for deleted photographers
 * while retaining financial and compliance records for audit purposes.
 *
 * RETAINED (for audit/compliance):
 * - photographers record (soft-deleted, serves as anchor)
 * - creditLedger (financial audit trail)
 * - creditAllocations (linked to ledger)
 * - consentRecords (PDPA compliance)
 * - promoCodeUsage (marketing analytics)
 * - giftCodeRedemptions (gift code history)
 *
 * DELETED (personal/operational data):
 * - events + photos + R2 objects + faceEmbeddings
 * - uploadIntents, logoUploadIntents
 * - ftpCredentials
 * - lineDeliveries
 * - photoLuts
 * - feedback
 * - Stripe customer (external service)
 *
 * Process:
 * 1. Query soft-deleted photographers older than grace period (default: 30 days)
 * 2. For each photographer, delete their content data
 * 3. Process in batches to avoid timeouts
 *
 * Runs daily at 5 AM Bangkok time (10 PM UTC)
 */
export async function photographerCleanup(env: Bindings): Promise<PhotographerCleanupResult> {
	const startTime = Date.now();
	const graceDays = env.HARD_DELETE_GRACE_DAYS ? parseInt(env.HARD_DELETE_GRACE_DAYS, 10) : 30;
	const batchSize = env.HARD_DELETE_BATCH_SIZE ? parseInt(env.HARD_DELETE_BATCH_SIZE, 10) : 5;

	console.log('[PhotographerCleanup] Cron started', {
		timestamp: new Date().toISOString(),
		graceDays,
		batchSize,
	});

	const db = createDbTx(env.DATABASE_URL);

	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - graceDays);

	const candidates = await db
		.select({
			id: photographers.id,
			clerkId: photographers.clerkId,
			stripeCustomerId: photographers.stripeCustomerId,
		})
		.from(photographers)
		.where(
			and(
				isNotNull(photographers.deletedAt),
				lt(photographers.deletedAt, cutoffDate.toISOString()),
				isNull(photographers.cleanedAt) // Only get not-yet-cleaned photographers
			)
		)
		.limit(batchSize);

	if (candidates.length === 0) {
		console.log('[PhotographerCleanup] No photographers to clean up');
		return {
			photographersProcessed: 0,
			photographerIds: [],
			eventsDeleted: 0,
		};
	}

	console.log('[PhotographerCleanup] Found candidates for cleanup', {
		count: candidates.length,
		photographerIds: candidates.map((p) => p.id),
	});

	const stripe = env.STRIPE_SECRET_KEY ? createStripeClient(env) : null;

	const photographersProcessed: string[] = [];
	let totalEventsDeleted = 0;

	for (const photographer of candidates) {
		try {
			console.log('[PhotographerCleanup] Processing photographer', {
				photographerId: photographer.id,
				clerkId: photographer.clerkId,
			});

			// Step 1: Find all their events (soft-deleted or not)
			const photographerEvents = await db
				.select({ id: events.id })
				.from(events)
				.where(eq(events.photographerId, photographer.id));

			// Step 2: Hard delete all events (if any)
			if (photographerEvents.length > 0) {
				const eventIds = photographerEvents.map((e) => e.id);
				console.log('[PhotographerCleanup] Deleting photographer events', {
					photographerId: photographer.id,
					eventCount: eventIds.length,
					eventIds,
				});

				const eventDeleteResult = await hardDeleteEvents({
					db,
					eventIds,
					r2Bucket: env.PHOTOS_BUCKET,
				});

				await eventDeleteResult.match(
					(results) => {
						const successes = results.filter((r) => r.success);
						const failures = results.filter((r) => !r.success);

						if (failures.length > 0) {
							console.error('[PhotographerCleanup] Some events failed to delete', {
								photographerId: photographer.id,
								succeeded: successes.length,
								failed: failures.length,
								failedEventIds: failures.map((r) => r.eventId),
							});
							throw new Error(
								`Failed to delete ${failures.length}/${eventIds.length} events for photographer ${photographer.id}`
							);
						}

						totalEventsDeleted += successes.length;
						console.log('[PhotographerCleanup] Events deleted successfully', {
							photographerId: photographer.id,
							eventsDeleted: successes.length,
						});
					},
					(error) => {
						throw new Error(`Event deletion failed: ${error.type}`);
					}
				);
			}

			// Step 3: Delete operational data (NOT financial/consent records)
			await db.transaction(async (tx) => {
				// Delete upload intents
				const uploadsDeleted = await tx
					.delete(uploadIntents)
					.where(eq(uploadIntents.photographerId, photographer.id))
					.returning({ id: uploadIntents.id });

				// Delete logo upload intents
				const logoUploadsDeleted = await tx
					.delete(logoUploadIntents)
					.where(eq(logoUploadIntents.photographerId, photographer.id))
					.returning({ id: logoUploadIntents.id });

				// Delete FTP credentials
				const ftpDeleted = await tx
					.delete(ftpCredentials)
					.where(eq(ftpCredentials.photographerId, photographer.id))
					.returning({ id: ftpCredentials.id });

				// Delete LINE deliveries
				const lineDeliveriesDeleted = await tx
					.delete(lineDeliveries)
					.where(eq(lineDeliveries.photographerId, photographer.id))
					.returning({ id: lineDeliveries.id });

				// Delete photo LUTs
				const lutsDeleted = await tx
					.delete(photoLuts)
					.where(eq(photoLuts.photographerId, photographer.id))
					.returning({ id: photoLuts.id });

				// Delete feedback
				const feedbackDeleted = await tx
					.delete(feedback)
					.where(eq(feedback.photographerId, photographer.id))
					.returning({ id: feedback.id });

				// Mark photographer as cleaned (prevents re-processing)
				await tx
					.update(photographers)
					.set({ cleanedAt: new Date().toISOString() })
					.where(eq(photographers.id, photographer.id));

				console.log('[PhotographerCleanup] Operational data deleted', {
					photographerId: photographer.id,
					uploadIntents: uploadsDeleted.length,
					logoUploadIntents: logoUploadsDeleted.length,
					ftpCredentials: ftpDeleted.length,
					lineDeliveries: lineDeliveriesDeleted.length,
					photoLuts: lutsDeleted.length,
					feedback: feedbackDeleted.length,
				});

				// Note: We intentionally do NOT delete:
				// - photographers record (kept as audit anchor)
				// - creditLedger (financial audit trail)
				// - creditAllocations (linked to ledger)
				// - consentRecords (PDPA compliance)
				// - promoCodeUsage (marketing analytics)
				// - giftCodeRedemptions (gift code history)
			});

			// Step 4: Delete Stripe customer (external service, best effort)
			if (stripe && photographer.stripeCustomerId) {
				try {
					await stripe.customers.del(photographer.stripeCustomerId);
					console.log('[PhotographerCleanup] Stripe customer deleted', {
						photographerId: photographer.id,
						stripeCustomerId: photographer.stripeCustomerId,
					});
				} catch (stripeError) {
					console.warn('[PhotographerCleanup] Stripe customer deletion failed (non-fatal)', {
						photographerId: photographer.id,
						stripeCustomerId: photographer.stripeCustomerId,
						error: stripeError instanceof Error ? stripeError.message : String(stripeError),
					});
				}
			}

			photographersProcessed.push(photographer.id);
			console.log('[PhotographerCleanup] Photographer content cleaned up (record retained)', {
				photographerId: photographer.id,
				clerkId: photographer.clerkId,
			});
		} catch (error) {
			console.error('[PhotographerCleanup] Photographer cleanup failed', {
				photographerId: photographer.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const duration = Date.now() - startTime;
	console.log('[PhotographerCleanup] Cron completed', {
		photographersProcessed: photographersProcessed.length,
		photographerIds: photographersProcessed,
		eventsDeleted: totalEventsDeleted,
		durationMs: duration,
	});

	return {
		photographersProcessed: photographersProcessed.length,
		photographerIds: photographersProcessed,
		eventsDeleted: totalEventsDeleted,
	};
}
