import { Hono } from 'hono';
import { z } from 'zod';
import { eq, desc, and, lt, lte, isNotNull } from 'drizzle-orm';
import { announcements } from '@/db';
import { zValidator } from '@hono/zod-validator';
import { ResultAsync, safeTry, ok } from 'neverthrow';
import type { Env } from '../types';
import { apiError, type HandlerError } from '../lib/error';

// =============================================================================
// Validation Schemas
// =============================================================================

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

// =============================================================================
// Helpers
// =============================================================================

/** Filter for active announcements with publishedAt <= now */
function activePublishedConditions(now: string) {
  return and(
    eq(announcements.active, true),
    isNotNull(announcements.publishedAt),
    lte(announcements.publishedAt, now),
  );
}

// =============================================================================
// Routes
// =============================================================================

export const publicAnnouncementsRouter = new Hono<Env>()
  // GET / — List active + published announcements
  .get('/', zValidator('query', listQuerySchema), async (c) => {
    const { cursor, limit } = c.req.valid('query');
    const db = c.var.db();

    return safeTry(async function* () {
      const now = new Date().toISOString();
      const conditions = [activePublishedConditions(now)!];

      if (cursor) {
        conditions.push(lt(announcements.publishedAt, cursor));
      }

      const rows = yield* ResultAsync.fromPromise(
        db
          .select({
            id: announcements.id,
            title: announcements.title,
            subtitle: announcements.subtitle,
            content: announcements.content,
            tag: announcements.tag,
            publishedAt: announcements.publishedAt,
          })
          .from(announcements)
          .where(and(...conditions))
          .orderBy(desc(announcements.publishedAt))
          .limit(limit + 1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].publishedAt : null;

      return ok({ data, nextCursor });
    })
      .orTee((e) => e.cause && console.error('[Public/Announcements]', e.code, e.cause))
      .match(
        (result) => c.json({ data: result.data, nextCursor: result.nextCursor }),
        (e) => apiError(c, e),
      );
  })

  // GET /latest — Single latest active + published announcement
  .get('/latest', async (c) => {
    const db = c.var.db();

    return safeTry(async function* () {
      const now = new Date().toISOString();

      const [latest] = yield* ResultAsync.fromPromise(
        db
          .select({
            id: announcements.id,
            title: announcements.title,
            subtitle: announcements.subtitle,
            content: announcements.content,
            tag: announcements.tag,
            publishedAt: announcements.publishedAt,
          })
          .from(announcements)
          .where(activePublishedConditions(now))
          .orderBy(desc(announcements.publishedAt))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok(latest ?? null);
    })
      .orTee((e) => e.cause && console.error('[Public/Announcements]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  });
