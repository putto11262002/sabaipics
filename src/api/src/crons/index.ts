import type { Bindings } from '../types';
import { cleanupExpiredEvents } from './cleanup';
import { hardDeleteCleanup } from './hard-delete-cleanup';
import { photographerCleanup } from './photographer-cleanup';
import {
	cleanupCompletedOriginals,
	cleanupNonRetryableFailed,
	cleanupStaleRetryable,
} from './upload-intent-cleanup';

/**
 * Cloudflare Workers scheduled event handler
 * Routes cron triggers to appropriate handlers based on schedule
 */
export async function scheduled(
	controller: ScheduledController,
	env: Bindings,
	ctx: ExecutionContext
): Promise<void> {
	console.log('[Cron] Scheduled event triggered', {
		cron: controller.cron,
		scheduledTime: controller.scheduledTime,
	});

	switch (controller.cron) {
		case '0 20 * * *': // 3 AM Bangkok time (UTC+7) - Soft delete expired events
			ctx.waitUntil(cleanupExpiredEvents(env));
			break;
		case '0 21 * * *': // 4 AM Bangkok time (UTC+7) - Hard delete old soft-deleted events
			ctx.waitUntil(hardDeleteCleanup(env));
			break;
		case '0 22 * * *': // 5 AM Bangkok time (UTC+7) - Hard delete old soft-deleted photographers
			ctx.waitUntil(photographerCleanup(env));
			break;
		case '0 23 * * *': // 6 AM Bangkok time (UTC+7) - Clean up completed upload originals (1 day)
			ctx.waitUntil(cleanupCompletedOriginals(env));
			break;
		case '10 23 * * *': // 6:10 AM Bangkok time (UTC+7) - Hard delete non-retryable failed intents (3 days)
			ctx.waitUntil(cleanupNonRetryableFailed(env));
			break;
		case '20 23 * * *': // 6:20 AM Bangkok time (UTC+7) - Hard delete stale retryable intents (7 days)
			ctx.waitUntil(cleanupStaleRetryable(env));
			break;
		default:
			console.warn('[Cron] Unknown cron schedule', {
				cron: controller.cron,
			});
	}
}
