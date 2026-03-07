import type { Database } from '@/db';
import { uploadIntents, photos, photoJobs } from '@/db';
import { eq } from 'drizzle-orm';

export interface UploadIntentCandidate {
	id: string;
	r2Key: string;
	photoId: string | null;
	eventId: string;
}

export interface HardDeleteIntentsResult {
	deleted: number;
	failed: number;
}

/**
 * Hard-deletes upload intents and all associated data:
 * R2 objects (raw upload + normalized + V2 pipeline artifacts) → photo_job → photo → upload_intent.
 *
 * Shared by cron cleanup jobs and admin cleanup endpoints.
 */
export async function hardDeleteUploadIntents(
	db: Database,
	bucket: R2Bucket,
	intents: UploadIntentCandidate[],
): Promise<HardDeleteIntentsResult> {
	let deleted = 0;
	let failed = 0;

	for (const intent of intents) {
		try {
			// Delete R2 objects first — if these fail, skip DB deletion so
			// the next run can retry (prevents orphaning R2 objects).
			if (intent.r2Key) {
				await bucket.delete(intent.r2Key);
			}
			if (intent.photoId) {
				const normalizedKey = `${intent.eventId}/${intent.photoId}.jpg`;
				await bucket.delete(normalizedKey);
			}

			// Delete V2 pipeline R2 artifacts (original + processed)
			const job = await db.query.photoJobs.findFirst({
				where: eq(photoJobs.uploadIntentId, intent.id),
				columns: { id: true, originalR2Key: true, processedR2Key: true },
			});
			if (job) {
				if (job.originalR2Key) await bucket.delete(job.originalR2Key);
				if (job.processedR2Key) await bucket.delete(job.processedR2Key);
				// Delete photo_job (FK restrict — must delete before intent)
				await db.delete(photoJobs).where(eq(photoJobs.id, job.id));
			}

			// Delete associated photo record if any
			if (intent.photoId) {
				await db.delete(photos).where(eq(photos.id, intent.photoId));
			}

			// Delete the upload intent record (only after R2 + photo cleanup succeeds)
			await db.delete(uploadIntents).where(eq(uploadIntents.id, intent.id));

			deleted++;
		} catch (error) {
			failed++;
			console.error('[UploadIntentCleanup] Failed to hard-delete intent', {
				intentId: intent.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { deleted, failed };
}
