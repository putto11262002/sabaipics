import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, lt } from 'drizzle-orm';
import { photos, events } from '@sabaipics/db';
import { requirePhotographer } from '../middleware';
import type { Bindings, Env } from '../types';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Zod schemas for validation
const paramsSchema = z.object({
	eventId: z.string().uuid('Invalid event ID format'),
});

const querySchema = z.object({
	cursor: z.string().datetime('Invalid cursor format').optional(),
	limit: z.coerce
		.number()
		.int()
		.min(1, 'Limit must be at least 1')
		.max(50, 'Limit cannot exceed 50')
		.default(20),
});

// Error helpers
function notFoundError(message: string) {
	return {
		error: {
			code: 'NOT_FOUND',
			message,
		},
	};
}

export const photosRouter = new Hono<Env>().get(
	'/:eventId/photos',
	requirePhotographer(),
	zValidator('param', paramsSchema),
	zValidator('query', querySchema),
	async (c) => {
		const { eventId } = c.req.valid('param');
		const { cursor, limit } = c.req.valid('query');

		const photographer = c.var.photographer;
		const db = c.var.db();

		// CRITICAL: Verify event ownership BEFORE querying photos
		const [event] = await db
			.select({ id: events.id })
			.from(events)
			.where(and(eq(events.id, eventId), eq(events.photographerId, photographer.id)))
			.limit(1);

		if (!event) {
			return c.json(notFoundError('Event not found'), 404);
		}

		// Cursor-based pagination: fetch limit + 1 to determine hasMore
		const parsedLimit = Math.min(limit, 50);
		const cursorLimit = parsedLimit + 1;

		const photoRows = await db
			.select({
				id: photos.id,
				r2Key: photos.r2Key,
				status: photos.status,
				faceCount: photos.faceCount,
				uploadedAt: photos.uploadedAt,
			})
			.from(photos)
			.where(and(eq(photos.eventId, eventId), cursor ? lt(photos.uploadedAt, cursor) : undefined))
			.orderBy(desc(photos.uploadedAt))
			.limit(cursorLimit);

		// Determine hasMore and trim extra row
		const hasMore = photoRows.length > parsedLimit;
		const items = hasMore ? photoRows.slice(0, parsedLimit) : photoRows;
		const nextCursor = hasMore ? items[parsedLimit - 1].uploadedAt : null;

		// Generate URLs for each photo
		const data = await Promise.all(
			items.map(async (photo) => ({
				id: photo.id,
				thumbnailUrl: generateThumbnailUrl(photo.r2Key, c.env.CF_ZONE, c.env.PHOTO_R2_BASE_URL),
				previewUrl: generatePreviewUrl(photo.r2Key, c.env.CF_ZONE, c.env.PHOTO_R2_BASE_URL),
				downloadUrl: await generateDownloadUrl(c.env, photo.r2Key),
				faceCount: photo.faceCount,
				status: photo.status,
				uploadedAt: photo.uploadedAt,
			}))
		);

		return c.json({
			data,
			pagination: {
				nextCursor,
				hasMore,
			},
		});
	}
);

// Generate presigned URL for download (15 min expiry)
// https://developers.cloudflare.com/r2/api/s3/presigned-urls/
async function generateDownloadUrl(env: Bindings, r2Key: string): Promise<string> {
	const s3 = new S3Client({
		region: 'auto',
		endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: env.R2_ACCESS_KEY_ID,
			secretAccessKey: env.R2_SECRET_ACCESS_KEY,
		},
	});

	const presignedUrl = await getSignedUrl(
		s3,
		new GetObjectCommand({ Bucket: env.PHOTO_BUCKET_NAME, Key: r2Key }),
		{ expiresIn: 3600 } // 3600 seconds = 1 hour
	);

	return presignedUrl;
}

// Public transform URLs (cached at edge)
function generateThumbnailUrl(r2Key: string, cfDomain: string, r2BaseUrl: string): string {
	return `${cfDomain}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${r2BaseUrl}/${r2Key}`;
}

function generatePreviewUrl(r2Key: string, cfDomain: string, r2BaseUrl: string): string {
	return `${cfDomain}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${r2BaseUrl}/${r2Key}`;
}
