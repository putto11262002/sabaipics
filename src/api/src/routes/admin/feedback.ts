import { Hono } from 'hono';
import { z } from 'zod';
import { eq, desc, and, ilike, lt } from 'drizzle-orm';
import { feedback, feedbackCategories, feedbackStatuses, feedbackSources, photographers } from '@/db';
import { requireAdmin } from '../../middleware';
import { zValidator } from '@hono/zod-validator';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';

// =============================================================================
// Validation Schemas
// =============================================================================

const listQuerySchema = z.object({
  status: z.enum([...feedbackStatuses, 'all' as const]).optional().default('all'),
  category: z.enum([...feedbackCategories, 'all' as const]).optional().default('all'),
  source: z.enum([...feedbackSources, 'all' as const]).optional().default('all'),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const updateSchema = z.object({
  status: z.enum(feedbackStatuses).optional(),
  adminNote: z.string().nullable().optional(),
});

// =============================================================================
// Routes
// =============================================================================

export const adminFeedbackRouter = new Hono<Env>()
  // GET / — List feedback with filters and cursor pagination
  .get('/', requireAdmin(), zValidator('query', listQuerySchema), async (c) => {
    const { status, category, source, search, cursor, limit } = c.req.valid('query');
    const db = c.var.db();

    return safeTry(async function* () {
      const conditions = [];

      if (status !== 'all') {
        conditions.push(eq(feedback.status, status));
      }

      if (category !== 'all') {
        conditions.push(eq(feedback.category, category));
      }

      if (source !== 'all') {
        conditions.push(eq(feedback.source, source));
      }

      if (search) {
        conditions.push(ilike(feedback.content, `%${search}%`));
      }

      if (cursor) {
        conditions.push(lt(feedback.createdAt, cursor));
      }

      const rows = yield* ResultAsync.fromPromise(
        db
          .select({
            id: feedback.id,
            content: feedback.content,
            category: feedback.category,
            status: feedback.status,
            source: feedback.source,
            photographerId: feedback.photographerId,
            eventId: feedback.eventId,
            adminNote: feedback.adminNote,
            createdAt: feedback.createdAt,
            updatedAt: feedback.updatedAt,
            photographerName: photographers.name,
            photographerEmail: photographers.email,
          })
          .from(feedback)
          .leftJoin(photographers, eq(feedback.photographerId, photographers.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(feedback.createdAt))
          .limit(limit + 1),
        (cause): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Database error',
          cause,
        }),
      );

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].createdAt : null;

      return ok({ data, nextCursor });
    })
      .orTee((e) => e.cause && console.error('[Admin/Feedback]', e.code, e.cause))
      .match(
        (result) => c.json({ data: result.data, nextCursor: result.nextCursor }),
        (e) => apiError(c, e),
      );
  })

  // GET /:id — Feedback detail
  .get('/:id', requireAdmin(), zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = c.var.db();

    return safeTry(async function* () {
      const [row] = yield* ResultAsync.fromPromise(
        db
          .select({
            id: feedback.id,
            content: feedback.content,
            category: feedback.category,
            status: feedback.status,
            source: feedback.source,
            photographerId: feedback.photographerId,
            eventId: feedback.eventId,
            adminNote: feedback.adminNote,
            createdAt: feedback.createdAt,
            updatedAt: feedback.updatedAt,
            photographerName: photographers.name,
            photographerEmail: photographers.email,
          })
          .from(feedback)
          .leftJoin(photographers, eq(feedback.photographerId, photographers.id))
          .where(eq(feedback.id, id))
          .limit(1),
        (cause): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Database error',
          cause,
        }),
      );

      if (!row) {
        return err<never, HandlerError>({
          code: 'NOT_FOUND',
          message: 'Feedback not found',
        });
      }

      return ok(row);
    })
      .orTee((e) => e.cause && console.error('[Admin/Feedback]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // PATCH /:id — Update feedback status + admin note
  .patch(
    '/:id',
    requireAdmin(),
    zValidator('param', idParamSchema),
    zValidator('json', updateSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const db = c.var.db();

      return safeTry(async function* () {
        const [existing] = yield* ResultAsync.fromPromise(
          db
            .select({ id: feedback.id })
            .from(feedback)
            .where(eq(feedback.id, id))
            .limit(1),
          (cause): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Database error',
            cause,
          }),
        );

        if (!existing) {
          return err<never, HandlerError>({
            code: 'NOT_FOUND',
            message: 'Feedback not found',
          });
        }

        const updates: Partial<typeof feedback.$inferInsert> = {};
        if (input.status !== undefined) updates.status = input.status;
        if (input.adminNote !== undefined) updates.adminNote = input.adminNote;

        if (Object.keys(updates).length === 0) {
          return err<never, HandlerError>({
            code: 'BAD_REQUEST',
            message: 'No fields to update',
          });
        }

        const [updated] = yield* ResultAsync.fromPromise(
          db
            .update(feedback)
            .set(updates)
            .where(eq(feedback.id, id))
            .returning(),
          (cause): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to update feedback',
            cause,
          }),
        );

        return ok(updated);
      })
        .orTee((e) => e.cause && console.error('[Admin/Feedback]', e.code, e.cause))
        .match(
          (data) => c.json({ data }),
          (e) => apiError(c, e),
        );
    },
  );
