import type { Bindings } from '../types';
import { cleanupExpiredEvents } from './cleanup';

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
		case '0 20 * * *': // 3 AM Bangkok time (UTC+7)
			ctx.waitUntil(cleanupExpiredEvents(env));
			break;
		default:
			console.warn('[Cron] Unknown cron schedule', {
				cron: controller.cron,
			});
	}
}
