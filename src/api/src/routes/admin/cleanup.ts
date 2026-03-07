import { Hono } from 'hono';
import {
	eq,
	and,
	or,
	isNull,
	isNotNull,
	lte,
	sql,
} from 'drizzle-orm';
import {
	uploadIntents,
	photoJobs,
	events,
	photographers,
	logoUploadIntents,
	ftpCredentials,
	lineDeliveries,
	photoLuts,
	feedback,
} from '@/db';
import { requireAdmin } from '../../middleware';
import { safeTry, ok } from 'neverthrow';
import { ResultAsync } from 'neverthrow';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error/index';
import { hardDeleteUploadIntents } from '../../lib/services/uploads/hard-delete-intents';
import { hardDeleteEvents, type HardDeleteResult } from '../../lib/services/events/hard-delete';
import { recomputeBalanceCache } from '../../lib/credits';
import { createStripeClient } from '../../lib/stripe';
import type { CreditRefundMessage } from '../../types/credit-queue';

const BATCH_SIZE = 100;

// Shared WHERE conditions (reused by GET count + POST action)
const failedOrExpiredUploadWhere = or(
	and(eq(uploadIntents.status, 'failed'), eq(uploadIntents.retryable, false)),
	and(eq(uploadIntents.status, 'failed'), eq(uploadIntents.retryable, true)),
	eq(uploadIntents.status, 'expired'),
);

const uncleanedOriginalsWhere = and(
	eq(uploadIntents.status, 'completed'),
	isNull(uploadIntents.r2CleanedAt),
);

const pendingOrProcessingWhere = or(
	eq(uploadIntents.status, 'pending'),
	eq(uploadIntents.status, 'processing'),
);

export const adminCleanupRouter = new Hono<Env>()

	// =========================================================================
	// Uploads: Hard-delete failed + expired
	// =========================================================================

	.get('/uploads/hard-delete', requireAdmin(), async (c) => {
		const db = c.var.db();
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(uploadIntents)
			.where(failedOrExpiredUploadWhere);
		return c.json({ data: { count } });
	})

	.post('/uploads/hard-delete', requireAdmin(), async (c) => {
		const db = c.var.db();
		let totalDeleted = 0;
		let totalFailed = 0;

		// Loop through batches until none remain
		while (true) {
			const batch = await db
				.select({
					id: uploadIntents.id,
					r2Key: uploadIntents.r2Key,
					photoId: uploadIntents.photoId,
					eventId: uploadIntents.eventId,
				})
				.from(uploadIntents)
				.where(failedOrExpiredUploadWhere)
				.limit(BATCH_SIZE);

			if (batch.length === 0) break;

			const { deleted, failed } = await hardDeleteUploadIntents(db, c.env.PHOTOS_BUCKET, batch);
			totalDeleted += deleted;
			totalFailed += failed;

			// If entire batch failed, stop to avoid infinite loop
			if (deleted === 0) break;
		}

		console.log('[Admin/Cleanup] Uploads hard-delete', { deleted: totalDeleted, failed: totalFailed });
		return c.json({ data: { deleted: totalDeleted, failed: totalFailed } });
	})

	// =========================================================================
	// Uploads: Clean completed originals
	// =========================================================================

	.get('/uploads/clean-originals', requireAdmin(), async (c) => {
		const db = c.var.db();
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(uploadIntents)
			.where(uncleanedOriginalsWhere);
		return c.json({ data: { count } });
	})

	.post('/uploads/clean-originals', requireAdmin(), async (c) => {
		const db = c.var.db();
		let totalCleaned = 0;
		let totalFailed = 0;

		while (true) {
			const batch = await db
				.select({ id: uploadIntents.id, r2Key: uploadIntents.r2Key })
				.from(uploadIntents)
				.where(uncleanedOriginalsWhere)
				.limit(BATCH_SIZE);

			if (batch.length === 0) break;

			let batchCleaned = 0;
			for (const intent of batch) {
				try {
					await c.env.PHOTOS_BUCKET.delete(intent.r2Key);
					await db
						.update(uploadIntents)
						.set({ r2CleanedAt: new Date().toISOString() })
						.where(eq(uploadIntents.id, intent.id));
					batchCleaned++;
				} catch (error) {
					totalFailed++;
					console.error('[Admin/Cleanup] Failed to clean completed original', {
						intentId: intent.id,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			totalCleaned += batchCleaned;
			if (batchCleaned === 0) break;
		}

		console.log('[Admin/Cleanup] Clean originals', { cleaned: totalCleaned, failed: totalFailed });
		return c.json({ data: { cleaned: totalCleaned, failed: totalFailed } });
	})

	// =========================================================================
	// Uploads: Expire pending
	// =========================================================================

	.get('/uploads/expire-pending', requireAdmin(), async (c) => {
		const db = c.var.db();
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(uploadIntents)
			.where(pendingOrProcessingWhere);
		return c.json({ data: { count } });
	})

	.post('/uploads/expire-pending', requireAdmin(), async (c) => {
		const db = c.var.db();
		let totalExpired = 0;
		let totalFailed = 0;

		while (true) {
			const batch = await db
				.select({ id: uploadIntents.id })
				.from(uploadIntents)
				.where(pendingOrProcessingWhere)
				.limit(BATCH_SIZE);

			if (batch.length === 0) break;

			let batchExpired = 0;
			for (const intent of batch) {
				try {
					await db
						.update(uploadIntents)
						.set({ status: 'expired' })
						.where(
							and(
								eq(uploadIntents.id, intent.id),
								pendingOrProcessingWhere,
							),
						);
					batchExpired++;
				} catch (error) {
					totalFailed++;
					console.error('[Admin/Cleanup] Failed to expire pending intent', {
						intentId: intent.id,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			totalExpired += batchExpired;
			if (batchExpired === 0) break;
		}

		console.log('[Admin/Cleanup] Expire pending', { expired: totalExpired, failed: totalFailed });
		return c.json({ data: { expired: totalExpired, failed: totalFailed } });
	})

	// =========================================================================
	// Pipeline: Stuck jobs
	// =========================================================================

	.get('/pipeline/stuck-jobs', requireAdmin(), async (c) => {
		const db = c.var.db();
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(photoJobs)
			.where(eq(photoJobs.status, 'submitted'));
		return c.json({ data: { count } });
	})

	.post('/pipeline/stuck-jobs', requireAdmin(), async (c) => {
		const dbTx = c.var.dbTx();
		let totalRecovered = 0;
		let totalFailed = 0;

		while (true) {
			const batch = await dbTx
				.select({
					id: photoJobs.id,
					uploadIntentId: photoJobs.uploadIntentId,
					photographerId: photoJobs.photographerId,
					creditsDebited: photoJobs.creditsDebited,
					creditsRefunded: photoJobs.creditsRefunded,
				})
				.from(photoJobs)
				.where(eq(photoJobs.status, 'submitted'))
				.limit(BATCH_SIZE);

			if (batch.length === 0) break;

			let batchRecovered = 0;
			for (const job of batch) {
				try {
					const refundable = Math.max(0, (job.creditsDebited ?? 0) - (job.creditsRefunded ?? 0));
					const now = new Date().toISOString();

					await dbTx.transaction(async (tx) => {
						await tx
							.update(photoJobs)
							.set({
								status: 'failed',
								errorCode: 'admin_cleanup',
								errorMessage: 'Recovered by admin cleanup trigger',
								retryable: true,
								creditsRefunded: job.creditsDebited,
								completedAt: now,
								updatedAt: now,
							})
							.where(eq(photoJobs.id, job.id));

						await tx
							.update(uploadIntents)
							.set({
								status: 'failed',
								errorCode: 'admin_cleanup',
								errorMessage: 'Recovered by admin cleanup trigger',
								retryable: true,
							})
							.where(eq(uploadIntents.id, job.uploadIntentId));
					});

					if (refundable > 0) {
						await c.env.CREDIT_QUEUE.send({
							type: 'refund',
							photographerId: job.photographerId,
							amount: refundable,
							source: 'refund',
							reason: 'admin_cleanup',
						} satisfies CreditRefundMessage);
					}

					batchRecovered++;
				} catch (error) {
					totalFailed++;
					console.error('[Admin/Cleanup] Failed to recover stuck job', {
						jobId: job.id,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			totalRecovered += batchRecovered;
			if (batchRecovered === 0) break;
		}

		console.log('[Admin/Cleanup] Stuck jobs', { recovered: totalRecovered, failed: totalFailed });
		return c.json({ data: { recovered: totalRecovered, failed: totalFailed } });
	})

	// =========================================================================
	// Events: Soft-delete expired
	// =========================================================================

	.get('/events/soft-delete-expired', requireAdmin(), async (c) => {
		const db = c.var.db();
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(events)
			.where(
				and(
					lte(events.expiresAt, sql`NOW()`),
					isNull(events.deletedAt),
				),
			);
		return c.json({ data: { count } });
	})

	.post('/events/soft-delete-expired', requireAdmin(), async (c) => {
		const db = c.var.db();

		// Bulk update — no batching needed, single UPDATE query
		const result = await db
			.update(events)
			.set({ deletedAt: new Date().toISOString() })
			.where(
				and(
					lte(events.expiresAt, sql`NOW()`),
					isNull(events.deletedAt),
				),
			)
			.returning({ id: events.id });

		console.log('[Admin/Cleanup] Soft-delete expired events', {
			count: result.length,
			eventIds: result.map((e) => e.id),
		});

		return c.json({ data: { softDeleted: result.length } });
	})

	// =========================================================================
	// Events: Hard-delete trashed
	// =========================================================================

	.get('/events/hard-delete-trashed', requireAdmin(), async (c) => {
		const db = c.var.db();
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(events)
			.where(isNotNull(events.deletedAt));
		return c.json({ data: { count } });
	})

	.post('/events/hard-delete-trashed', requireAdmin(), async (c) => {
		const dbTx = c.var.dbTx();

		return safeTry(async function* () {
			const allResults: HardDeleteResult[] = [];

			while (true) {
				const batch = yield* ResultAsync.fromPromise(
					dbTx
						.select({ id: events.id })
						.from(events)
						.where(isNotNull(events.deletedAt))
						.limit(BATCH_SIZE),
					(cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
				);

				if (batch.length === 0) break;

				const batchResults = yield* hardDeleteEvents({
					db: dbTx,
					eventIds: batch.map((e) => e.id),
					r2Bucket: c.env.PHOTOS_BUCKET,
				}).mapErr(
					(serviceError): HandlerError => ({
						code: 'INTERNAL_ERROR',
						message: `Batch hard delete failed: ${serviceError.type}`,
						cause: serviceError,
					}),
				);

				allResults.push(...batchResults);

				// If none succeeded in this batch, stop
				if (batchResults.every((r) => !r.success)) break;
			}

			const deletedCount = allResults.filter((r) => r.success).length;

			console.log('[Admin/Cleanup] Hard-delete trashed events', {
				deletedCount,
				failedCount: allResults.length - deletedCount,
			});

			return ok({ deletedCount, results: allResults });
		})
			.orTee((e) => e.cause && console.error('[Admin/Cleanup]', e.code, e.cause))
			.match(
				(data) => c.json({ data }),
				(e) => apiError(c, e),
			);
	})

	// =========================================================================
	// Photographers
	// =========================================================================

	.get('/photographers', requireAdmin(), async (c) => {
		const db = c.var.db();
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(photographers)
			.where(
				and(
					isNotNull(photographers.deletedAt),
					isNull(photographers.cleanedAt),
				),
			);
		return c.json({ data: { count } });
	})

	.post('/photographers', requireAdmin(), async (c) => {
		const dbTx = c.var.dbTx();

		const candidates = await dbTx
			.select({
				id: photographers.id,
				clerkId: photographers.clerkId,
				stripeCustomerId: photographers.stripeCustomerId,
			})
			.from(photographers)
			.where(
				and(
					isNotNull(photographers.deletedAt),
					isNull(photographers.cleanedAt),
				),
			);

		if (candidates.length === 0) {
			return c.json({ data: { photographersProcessed: 0, eventsDeleted: 0 } });
		}

		const stripe = c.env.STRIPE_SECRET_KEY ? createStripeClient(c.env) : null;
		const processed: string[] = [];
		let totalEventsDeleted = 0;

		for (const photographer of candidates) {
			try {
				const photographerEvents = await dbTx
					.select({ id: events.id })
					.from(events)
					.where(eq(events.photographerId, photographer.id));

				if (photographerEvents.length > 0) {
					const eventIds = photographerEvents.map((e) => e.id);
					const eventDeleteResult = await hardDeleteEvents({
						db: dbTx,
						eventIds,
						r2Bucket: c.env.PHOTOS_BUCKET,
					});

					await eventDeleteResult.match(
						(results) => {
							const failures = results.filter((r) => !r.success);
							if (failures.length > 0) {
								throw new Error(
									`Failed to delete ${failures.length}/${eventIds.length} events for photographer ${photographer.id}`,
								);
							}
							totalEventsDeleted += results.filter((r) => r.success).length;
						},
						(error) => {
							throw new Error(`Event deletion failed: ${error.type}`);
						},
					);
				}

				await dbTx.transaction(async (tx) => {
					await tx.delete(uploadIntents).where(eq(uploadIntents.photographerId, photographer.id));
					await tx.delete(logoUploadIntents).where(eq(logoUploadIntents.photographerId, photographer.id));
					await tx.delete(ftpCredentials).where(eq(ftpCredentials.photographerId, photographer.id));
					await tx.delete(lineDeliveries).where(eq(lineDeliveries.photographerId, photographer.id));
					await tx.delete(photoLuts).where(eq(photoLuts.photographerId, photographer.id));
					await tx.delete(feedback).where(eq(feedback.photographerId, photographer.id));
					await tx
						.update(photographers)
						.set({ cleanedAt: new Date().toISOString() })
						.where(eq(photographers.id, photographer.id));
				});

				if (stripe && photographer.stripeCustomerId) {
					try {
						await stripe.customers.del(photographer.stripeCustomerId);
					} catch (stripeError) {
						console.warn('[Admin/Cleanup] Stripe customer deletion failed (non-fatal)', {
							photographerId: photographer.id,
							error: stripeError instanceof Error ? stripeError.message : String(stripeError),
						});
					}
				}

				processed.push(photographer.id);
			} catch (error) {
				console.error('[Admin/Cleanup] Photographer cleanup failed', {
					photographerId: photographer.id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		console.log('[Admin/Cleanup] Photographers', {
			photographersProcessed: processed.length,
			eventsDeleted: totalEventsDeleted,
		});

		return c.json({
			data: {
				photographersProcessed: processed.length,
				eventsDeleted: totalEventsDeleted,
			},
		});
	})

	// =========================================================================
	// Credits: Reconcile
	// =========================================================================

	.get('/credits/reconcile', requireAdmin(), async (c) => {
		const db = c.var.db();
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(photographers)
			.where(isNotNull(photographers.balanceInvalidateAt));
		return c.json({ data: { count } });
	})

	.post('/credits/reconcile', requireAdmin(), async (c) => {
		const db = c.var.db();

		const stale = await db
			.select({ id: photographers.id })
			.from(photographers)
			.where(isNotNull(photographers.balanceInvalidateAt));

		if (stale.length === 0) {
			return c.json({ data: { stalePhotographers: 0, reconciled: 0, failed: 0 } });
		}

		let reconciled = 0;
		let failed = 0;

		for (const row of stale) {
			const result = await recomputeBalanceCache(db, row.id).match(
				() => ({ ok: true as const }),
				(error) => ({ ok: false as const, error }),
			);

			if (result.ok) {
				reconciled++;
			} else {
				failed++;
				console.error('[Admin/Cleanup] Failed to reconcile balance', {
					photographerId: row.id,
					cause: result.error.cause,
				});
			}
		}

		console.log('[Admin/Cleanup] Credit reconcile', {
			stalePhotographers: stale.length,
			reconciled,
			failed,
		});

		return c.json({ data: { stalePhotographers: stale.length, reconciled, failed } });
	});
