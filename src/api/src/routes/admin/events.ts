import { Hono } from 'hono';
import { z } from 'zod';
import {
  eq,
  desc,
  sql,
  and,
  isNull,
  isNotNull,
  ilike,
  or,
  lt,
  countDistinct,
} from 'drizzle-orm';
import { events, photos, photographers, participantSearches, uploadIntents } from '@/db';
import { requireAdmin } from '../../middleware';
import { zValidator } from '@hono/zod-validator';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';
import { hardDeleteEvents, type HardDeleteResult } from '../../lib/services/events/hard-delete';

// =============================================================================
// Constants
// =============================================================================

const HARD_DELETE_GRACE_DAYS = 30;

// =============================================================================
// Validation Schemas
// =============================================================================

const listQuerySchema = z.object({
  status: z.enum(['active', 'expired', 'trashed']).optional().default('active'),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(250).optional().default(50),
});

const idParamSchema = z.object({ id: z.string().uuid() });

// =============================================================================
// Routes
// =============================================================================

export const adminEventsRouter = new Hono<Env>()
  // GET / — List events (paginated, filterable, searchable)
  .get('/', requireAdmin(), zValidator('query', listQuerySchema), async (c) => {
    const { status, search, cursor, limit } = c.req.valid('query');
    const db = c.var.db();

    return safeTry(async function* () {
      const conditions = [];
      const now = new Date().toISOString();

      // Status filtering
      switch (status) {
        case 'active':
          conditions.push(isNull(events.deletedAt));
          conditions.push(sql`${events.expiresAt} > ${now}`);
          break;
        case 'expired':
          conditions.push(isNull(events.deletedAt));
          conditions.push(sql`${events.expiresAt} <= ${now}`);
          break;
        case 'trashed':
          conditions.push(isNotNull(events.deletedAt));
          break;
      }

      // Search on event name, photographer name, or photographer email
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            ilike(events.name, pattern),
            ilike(photographers.name, pattern),
            ilike(photographers.email, pattern),
          )!,
        );
      }

      // Cursor-based pagination
      if (cursor) {
        conditions.push(lt(events.createdAt, cursor));
      }

      // Subqueries for per-event stats
      const photoStatsSq = db
        .select({
          eventId: photos.eventId,
          photoCount: sql<number>`count(*)`.mapWith(Number).as('photo_count'),
          storageBytes: sql<number>`coalesce(sum(${photos.fileSize}), 0)`.mapWith(Number).as('storage_bytes'),
          faceCount: sql<number>`coalesce(sum(${photos.faceCount}), 0)`.mapWith(Number).as('face_count'),
        })
        .from(photos)
        .where(isNull(photos.deletedAt))
        .groupBy(photos.eventId)
        .as('photo_stats');

      const rows = yield* ResultAsync.fromPromise(
        db
          .select({
            id: events.id,
            name: events.name,
            expiresAt: events.expiresAt,
            deletedAt: events.deletedAt,
            createdAt: events.createdAt,
            photographer: {
              id: photographers.id,
              name: photographers.name,
              email: photographers.email,
            },
            photoCount: sql<number>`coalesce(${photoStatsSq.photoCount}, 0)`.mapWith(Number),
            storageBytes: sql<number>`coalesce(${photoStatsSq.storageBytes}, 0)`.mapWith(Number),
            faceCount: sql<number>`coalesce(${photoStatsSq.faceCount}, 0)`.mapWith(Number),
          })
          .from(events)
          .innerJoin(photographers, eq(events.photographerId, photographers.id))
          .leftJoin(photoStatsSq, eq(events.id, photoStatsSq.eventId))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(events.createdAt))
          .limit(limit + 1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].createdAt : null;

      return ok({ data, nextCursor });
    })
      .orTee((e) => e.cause && console.error('[Admin/Events]', e.code, e.cause))
      .match(
        (result) => c.json({ data: result.data, nextCursor: result.nextCursor }),
        (e) => apiError(c, e),
      );
  })

  // GET /stats — Global platform stats
  .get('/stats', requireAdmin(), async (c) => {
    const db = c.var.db();

    return safeTry(async function* () {
      const now = new Date().toISOString();

      const [stats] = yield* ResultAsync.fromPromise(
        db
          .select({
            totalActive: sql<number>`count(*) filter (where ${events.deletedAt} is null and ${events.expiresAt} > ${now})`.mapWith(Number),
            totalExpired: sql<number>`count(*) filter (where ${events.deletedAt} is null and ${events.expiresAt} <= ${now})`.mapWith(Number),
            totalTrashed: sql<number>`count(*) filter (where ${events.deletedAt} is not null)`.mapWith(Number),
          })
          .from(events),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const [photoStats] = yield* ResultAsync.fromPromise(
        db
          .select({
            totalPhotos: sql<number>`count(*)`.mapWith(Number),
            totalStorageBytes: sql<number>`coalesce(sum(${photos.fileSize}), 0)`.mapWith(Number),
          })
          .from(photos)
          .where(isNull(photos.deletedAt)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const [photographerStats] = yield* ResultAsync.fromPromise(
        db
          .select({
            totalPhotographers: countDistinct(events.photographerId),
          })
          .from(events)
          .where(isNull(events.deletedAt)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({
        totalActive: stats?.totalActive ?? 0,
        totalExpired: stats?.totalExpired ?? 0,
        totalTrashed: stats?.totalTrashed ?? 0,
        totalPhotos: photoStats?.totalPhotos ?? 0,
        totalStorageBytes: photoStats?.totalStorageBytes ?? 0,
        totalPhotographers: photographerStats?.totalPhotographers ?? 0,
      });
    })
      .orTee((e) => e.cause && console.error('[Admin/Events]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // GET /:id — Event detail
  .get('/:id', requireAdmin(), zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = c.var.db();

    return safeTry(async function* () {
      // Fetch event + photographer
      const [row] = yield* ResultAsync.fromPromise(
        db
          .select({
            event: {
              id: events.id,
              name: events.name,
              subtitle: events.subtitle,
              startDate: events.startDate,
              endDate: events.endDate,
              expiresAt: events.expiresAt,
              deletedAt: events.deletedAt,
              createdAt: events.createdAt,
            },
            photographer: {
              id: photographers.id,
              name: photographers.name,
              email: photographers.email,
            },
          })
          .from(events)
          .innerJoin(photographers, eq(events.photographerId, photographers.id))
          .where(eq(events.id, id))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!row) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      // Photo stats
      const [photoStats] = yield* ResultAsync.fromPromise(
        db
          .select({
            photoCount: sql<number>`count(*)`.mapWith(Number),
            storageBytes: sql<number>`coalesce(sum(${photos.fileSize}), 0)`.mapWith(Number),
            faceCount: sql<number>`coalesce(sum(${photos.faceCount}), 0)`.mapWith(Number),
          })
          .from(photos)
          .where(and(eq(photos.eventId, id), isNull(photos.deletedAt))),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      // Upload intent stats by status
      const uploadStats = yield* ResultAsync.fromPromise(
        db
          .select({
            status: uploadIntents.status,
            count: sql<number>`count(*)`.mapWith(Number),
          })
          .from(uploadIntents)
          .where(eq(uploadIntents.eventId, id))
          .groupBy(uploadIntents.status),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const uploadsByStatus = Object.fromEntries(
        uploadStats.map((row) => [row.status, row.count]),
      ) as Record<string, number>;

      // Participant search count
      const [searchStats] = yield* ResultAsync.fromPromise(
        db
          .select({
            searchCount: sql<number>`count(*)`.mapWith(Number),
          })
          .from(participantSearches)
          .where(eq(participantSearches.eventId, id)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({
        event: row.event,
        photographer: row.photographer,
        stats: {
          photoCount: photoStats?.photoCount ?? 0,
          storageBytes: photoStats?.storageBytes ?? 0,
          faceCount: photoStats?.faceCount ?? 0,
          searchCount: searchStats?.searchCount ?? 0,
          uploads: {
            completed: uploadsByStatus['completed'] ?? 0,
            failed: uploadsByStatus['failed'] ?? 0,
            pending: uploadsByStatus['pending'] ?? 0,
            expired: uploadsByStatus['expired'] ?? 0,
          },
        },
      });
    })
      .orTee((e) => e.cause && console.error('[Admin/Events]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // DELETE /:id — Soft-delete
  .delete('/:id', requireAdmin(), zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = c.var.db();

    return safeTry(async function* () {
      const [event] = yield* ResultAsync.fromPromise(
        db
          .select({ id: events.id, deletedAt: events.deletedAt })
          .from(events)
          .where(eq(events.id, id))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!event) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      if (event.deletedAt) {
        return err<never, HandlerError>({ code: 'CONFLICT', message: 'Event is already trashed' });
      }

      yield* ResultAsync.fromPromise(
        db
          .update(events)
          .set({ deletedAt: sql`now()` })
          .where(eq(events.id, id)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to soft-delete event', cause }),
      );

      return ok({ success: true });
    })
      .orTee((e) => e.cause && console.error('[Admin/Events]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // DELETE /:id/hard — Hard-delete
  .delete('/:id/hard', requireAdmin(), zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = c.var.dbTx();

    return safeTry(async function* () {
      // Verify event exists
      const [event] = yield* ResultAsync.fromPromise(
        db
          .select({ id: events.id })
          .from(events)
          .where(eq(events.id, id))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!event) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      const results = yield* hardDeleteEvents({
        db,
        eventIds: [id],
        r2Bucket: c.env.PHOTOS_BUCKET,
      }).mapErr(
        (serviceError): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: `Hard delete failed: ${serviceError.type}`,
          cause: serviceError,
        }),
      );

      const result = results[0];
      if (!result || !result.success) {
        return err<never, HandlerError>({
          code: 'INTERNAL_ERROR',
          message: `Hard delete failed for event ${id}`,
          cause: result?.error,
        });
      }

      const d = result.deleted;
      console.log('[Admin/Events] Hard delete complete', {
        eventId: id,
        db: {
          photos: d.database.photos,
          searches: d.database.participantSearches,
          uploads: d.database.uploadIntents,
          logoUploads: d.database.logoUploadIntents,
          ftp: d.database.ftpCredentials,
        },
        r2Objects: d.r2Objects,
      });

      return ok(result);
    })
      .orTee((e) => e.cause && console.error('[Admin/Events]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // POST /empty-trash — Batch hard-delete events past grace period
  .post('/empty-trash', requireAdmin(), async (c) => {
    const db = c.var.dbTx();

    return safeTry(async function* () {
      const graceCutoff = new Date();
      graceCutoff.setDate(graceCutoff.getDate() - HARD_DELETE_GRACE_DAYS);

      // Find trashed events past grace period
      const trashedEvents = yield* ResultAsync.fromPromise(
        db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              isNotNull(events.deletedAt),
              lt(events.deletedAt, graceCutoff.toISOString()),
            ),
          ),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (trashedEvents.length === 0) {
        return ok({ deletedCount: 0, results: [] });
      }

      const eventIds = trashedEvents.map((e) => e.id);

      // Chunk into batches of 100 (hardDeleteEvents limit)
      const BATCH_SIZE = 100;
      const allResults: HardDeleteResult[] = [];

      for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
        const batch = eventIds.slice(i, i + BATCH_SIZE);
        const batchResults = yield* hardDeleteEvents({
          db,
          eventIds: batch,
          r2Bucket: c.env.PHOTOS_BUCKET,
        }).mapErr(
          (serviceError): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: `Batch hard delete failed: ${serviceError.type}`,
            cause: serviceError,
          }),
        );
        allResults.push(...batchResults);
      }

      const results = allResults;
      const deletedCount = results.filter((r) => r.success).length;
      const failedCount = results.length - deletedCount;
      const totals = results.reduce(
        (acc, r) => {
          acc.photos += r.deleted.database.photos;
          acc.searches += r.deleted.database.participantSearches;
          acc.uploads += r.deleted.database.uploadIntents;
          acc.r2Objects += r.deleted.r2Objects;
          return acc;
        },
        { photos: 0, searches: 0, uploads: 0, r2Objects: 0 },
      );

      console.log('[Admin/Events] Empty trash complete', {
        eventsDeleted: deletedCount,
        eventsFailed: failedCount,
        totals,
      });

      return ok({ deletedCount, results });
    })
      .orTee((e) => e.cause && console.error('[Admin/Events]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  });
