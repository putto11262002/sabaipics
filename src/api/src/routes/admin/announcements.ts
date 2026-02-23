import { Hono } from 'hono';
import { z } from 'zod';
import {
  eq,
  desc,
  and,
  ilike,
  or,
  lt,
  isNull,
  isNotNull,
  lte,
  sql,
} from 'drizzle-orm';
import { announcements, announcementTags } from '@/db';
import { requireAdmin } from '../../middleware';
import { zValidator } from '@hono/zod-validator';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';

// =============================================================================
// Validation Schemas
// =============================================================================

const createSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(500).optional(),
  content: z.string().min(1),
  tag: z.enum(announcementTags).optional(),
  publishedAt: z.string().datetime().optional(),
  active: z.boolean().optional().default(false),
});

const listQuerySchema = z.object({
  search: z.string().optional(),
  tag: z.enum(announcementTags).optional(),
  status: z.enum(['all', 'active', 'draft']).optional().default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  subtitle: z.string().max(500).nullable().optional(),
  content: z.string().min(1).optional(),
  tag: z.enum(announcementTags).nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
});

// =============================================================================
// Routes
// =============================================================================

export const announcementsRouter = new Hono<Env>()
  // POST / — Create announcement
  .post('/', requireAdmin(), zValidator('json', createSchema), async (c) => {
    const input = c.req.valid('json');
    const db = c.var.db();
    const adminEmail = c.var.adminEmail ?? 'dev@admin.local';

    return safeTry(async function* () {
      // Auto-set publishedAt when activating without a date
      const publishedAt = input.active && !input.publishedAt
        ? new Date().toISOString()
        : input.publishedAt;

      const [created] = yield* ResultAsync.fromPromise(
        db
          .insert(announcements)
          .values({
            title: input.title,
            subtitle: input.subtitle,
            content: input.content,
            tag: input.tag,
            publishedAt,
            active: input.active,
            createdBy: adminEmail,
          })
          .returning(),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to create announcement', cause }),
      );

      return ok(created);
    })
      .orTee((e) => e.cause && console.error('[Admin/Announcements]', e.code, e.cause))
      .match(
        (data) => c.json({ data }, 201),
        (e) => apiError(c, e),
      );
  })

  // GET / — List announcements with search, tag filter, status filter, cursor pagination
  .get('/', requireAdmin(), zValidator('query', listQuerySchema), async (c) => {
    const { search, tag, status, cursor, limit } = c.req.valid('query');
    const db = c.var.db();

    return safeTry(async function* () {
      const conditions = [];
      const now = new Date().toISOString();

      // Status filter
      switch (status) {
        case 'active':
          conditions.push(eq(announcements.active, true));
          conditions.push(isNotNull(announcements.publishedAt));
          conditions.push(lte(announcements.publishedAt, now));
          break;
        case 'draft':
          conditions.push(
            or(
              eq(announcements.active, false),
              isNull(announcements.publishedAt),
              sql`${announcements.publishedAt} > ${now}`,
            )!,
          );
          break;
        // 'all' — no filter
      }

      // Tag filter
      if (tag) {
        conditions.push(eq(announcements.tag, tag));
      }

      // Search filter
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            ilike(announcements.title, pattern),
            ilike(announcements.subtitle, pattern),
          )!,
        );
      }

      // Cursor pagination
      if (cursor) {
        conditions.push(lt(announcements.createdAt, cursor));
      }

      const rows = yield* ResultAsync.fromPromise(
        db
          .select()
          .from(announcements)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(announcements.createdAt))
          .limit(limit + 1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].createdAt : null;

      return ok({ data, nextCursor });
    })
      .orTee((e) => e.cause && console.error('[Admin/Announcements]', e.code, e.cause))
      .match(
        (result) => c.json({ data: result.data, nextCursor: result.nextCursor }),
        (e) => apiError(c, e),
      );
  })

  // GET /:id — Announcement detail
  .get('/:id', requireAdmin(), zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = c.var.db();

    return safeTry(async function* () {
      const [announcement] = yield* ResultAsync.fromPromise(
        db.select().from(announcements).where(eq(announcements.id, id)).limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!announcement) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Announcement not found' });
      }

      return ok(announcement);
    })
      .orTee((e) => e.cause && console.error('[Admin/Announcements]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // PATCH /:id — Update announcement
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
            .select({ id: announcements.id, publishedAt: announcements.publishedAt })
            .from(announcements)
            .where(eq(announcements.id, id))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!existing) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Announcement not found' });
        }

        const updates: Partial<typeof announcements.$inferInsert> = {};
        if (input.title !== undefined) updates.title = input.title;
        if (input.subtitle !== undefined) updates.subtitle = input.subtitle;
        if (input.content !== undefined) updates.content = input.content;
        if (input.tag !== undefined) updates.tag = input.tag;
        if (input.publishedAt !== undefined) updates.publishedAt = input.publishedAt;
        if (input.active !== undefined) updates.active = input.active;

        // Auto-set publishedAt when activating without a date
        if (updates.active === true && updates.publishedAt === undefined && !existing.publishedAt) {
          updates.publishedAt = new Date().toISOString();
        }

        if (Object.keys(updates).length === 0) {
          return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'No fields to update' });
        }

        const [updated] = yield* ResultAsync.fromPromise(
          db
            .update(announcements)
            .set(updates)
            .where(eq(announcements.id, id))
            .returning(),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to update announcement', cause }),
        );

        return ok(updated);
      })
        .orTee((e) => e.cause && console.error('[Admin/Announcements]', e.code, e.cause))
        .match(
          (data) => c.json({ data }),
          (e) => apiError(c, e),
        );
    },
  )

  // DELETE /:id — Hard delete announcement
  .delete('/:id', requireAdmin(), zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = c.var.db();

    return safeTry(async function* () {
      const [existing] = yield* ResultAsync.fromPromise(
        db
          .select({ id: announcements.id })
          .from(announcements)
          .where(eq(announcements.id, id))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!existing) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Announcement not found' });
      }

      yield* ResultAsync.fromPromise(
        db.delete(announcements).where(eq(announcements.id, id)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to delete announcement', cause }),
      );

      return ok({ id });
    })
      .orTee((e) => e.cause && console.error('[Admin/Announcements]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  });
