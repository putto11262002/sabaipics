import { Hono } from 'hono';
import { z } from 'zod';
import { eq, desc, sql, and, isNull, isNotNull, ilike, or, lt } from 'drizzle-orm';
import { photographers, creditLedger, events, photos } from '@/db';
import { requireAdmin } from '../../middleware';
import { zValidator } from '@hono/zod-validator';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { createClerkClient } from '@clerk/backend';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';

// =============================================================================
// Validation Schemas
// =============================================================================

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['all', 'active', 'banned', 'deleted']).optional().default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const creditsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

// =============================================================================
// Routes
// =============================================================================

export const adminUsersRouter = new Hono<Env>()
  // GET / - List photographers (paginated, searchable, filterable)
  .get('/', requireAdmin(), zValidator('query', listQuerySchema), async (c) => {
    const { search, status, cursor, limit } = c.req.valid('query');
    const db = c.var.db();

    return safeTry(async function* () {
      const conditions = [];

      // Status filter
      switch (status) {
        case 'active':
          conditions.push(isNull(photographers.bannedAt));
          conditions.push(isNull(photographers.deletedAt));
          break;
        case 'banned':
          conditions.push(isNotNull(photographers.bannedAt));
          conditions.push(isNull(photographers.deletedAt));
          break;
        case 'deleted':
          conditions.push(isNotNull(photographers.deletedAt));
          break;
        default:
          // 'all' — exclude deleted by default
          conditions.push(isNull(photographers.deletedAt));
          break;
      }

      // Search filter (name or email ilike)
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            ilike(photographers.name, pattern),
            ilike(photographers.email, pattern),
          )!,
        );
      }

      // Cursor-based pagination (createdAt ISO string)
      if (cursor) {
        conditions.push(lt(photographers.createdAt, cursor));
      }

      const rows = yield* ResultAsync.fromPromise(
        db
          .select({
            id: photographers.id,
            clerkId: photographers.clerkId,
            email: photographers.email,
            name: photographers.name,
            balance: photographers.balance,
            bannedAt: photographers.bannedAt,
            deletedAt: photographers.deletedAt,
            createdAt: photographers.createdAt,
          })
          .from(photographers)
          .where(and(...conditions))
          .orderBy(desc(photographers.createdAt))
          .limit(limit + 1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].createdAt : null;

      return ok({ data, nextCursor });
    })
      .orTee((e) => e.cause && console.error('[Admin]', e.code, e.cause))
      .match(
        (result) => c.json({ data: result.data, nextCursor: result.nextCursor }),
        (e) => apiError(c, e),
      );
  })

  // GET /:id - User detail + credit stats
  .get('/:id', requireAdmin(), zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = c.var.db();

    return safeTry(async function* () {
      // Get photographer
      const [user] = yield* ResultAsync.fromPromise(
        db.select().from(photographers).where(eq(photographers.id, id)).limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!user) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // Get aggregated stats
      const [creditStats] = yield* ResultAsync.fromPromise(
        db
          .select({
            totalCredits: sql<number>`coalesce(sum(case when ${creditLedger.amount} > 0 then ${creditLedger.amount} else 0 end), 0)`.mapWith(Number),
            totalDebits: sql<number>`coalesce(sum(case when ${creditLedger.amount} < 0 then ${creditLedger.amount} else 0 end), 0)`.mapWith(Number),
          })
          .from(creditLedger)
          .where(eq(creditLedger.photographerId, id)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const [eventStats] = yield* ResultAsync.fromPromise(
        db
          .select({
            totalEvents: sql<number>`count(*)`.mapWith(Number),
          })
          .from(events)
          .where(and(eq(events.photographerId, id), isNull(events.deletedAt))),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const [photoStats] = yield* ResultAsync.fromPromise(
        db
          .select({
            totalPhotos: sql<number>`count(*)`.mapWith(Number),
          })
          .from(photos)
          .innerJoin(events, eq(photos.eventId, events.id))
          .where(and(eq(events.photographerId, id), isNull(photos.deletedAt))),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({
        user,
        stats: {
          totalCredits: creditStats?.totalCredits ?? 0,
          totalDebits: creditStats?.totalDebits ?? 0,
          totalEvents: eventStats?.totalEvents ?? 0,
          totalPhotos: photoStats?.totalPhotos ?? 0,
        },
      });
    })
      .orTee((e) => e.cause && console.error('[Admin]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // GET /:id/credits - Paginated credit ledger
  .get(
    '/:id/credits',
    requireAdmin(),
    zValidator('param', idParamSchema),
    zValidator('query', creditsQuerySchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const { cursor, limit } = c.req.valid('query');
      const db = c.var.db();

      return safeTry(async function* () {
        // Verify user exists
        const [user] = yield* ResultAsync.fromPromise(
          db
            .select({ id: photographers.id })
            .from(photographers)
            .where(eq(photographers.id, id))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!user) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'User not found' });
        }

        const conditions = [eq(creditLedger.photographerId, id)];
        if (cursor) {
          conditions.push(lt(creditLedger.createdAt, cursor));
        }

        const rows = yield* ResultAsync.fromPromise(
          db
            .select()
            .from(creditLedger)
            .where(and(...conditions))
            .orderBy(desc(creditLedger.createdAt))
            .limit(limit + 1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        const hasMore = rows.length > limit;
        const data = hasMore ? rows.slice(0, limit) : rows;
        const nextCursor = hasMore ? data[data.length - 1].createdAt : null;

        return ok({ data, nextCursor });
      })
        .orTee((e) => e.cause && console.error('[Admin]', e.code, e.cause))
        .match(
          (result) => c.json({ data: result.data, nextCursor: result.nextCursor }),
          (e) => apiError(c, e),
        );
    },
  )

  // POST /:id/lock - Lock user via Clerk API
  .post('/:id/lock', requireAdmin(), zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = c.var.db();

    return safeTry(async function* () {
      // Look up photographer → get clerkId
      const [user] = yield* ResultAsync.fromPromise(
        db
          .select({ clerkId: photographers.clerkId })
          .from(photographers)
          .where(eq(photographers.id, id))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!user) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // Call Clerk lockUser API
      const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
      yield* ResultAsync.fromPromise(
        clerk.users.lockUser(user.clerkId),
        (cause): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: 'Failed to lock user via Clerk',
          cause,
        }),
      );

      return ok({ success: true });
    })
      .orTee((e) => e.cause && console.error('[Admin]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // POST /:id/unlock - Unlock user via Clerk API
  .post('/:id/unlock', requireAdmin(), zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = c.var.db();

    return safeTry(async function* () {
      // Look up photographer → get clerkId
      const [user] = yield* ResultAsync.fromPromise(
        db
          .select({ clerkId: photographers.clerkId })
          .from(photographers)
          .where(eq(photographers.id, id))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!user) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // Call Clerk unlockUser API
      const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
      yield* ResultAsync.fromPromise(
        clerk.users.unlockUser(user.clerkId),
        (cause): HandlerError => ({
          code: 'BAD_GATEWAY',
          message: 'Failed to unlock user via Clerk',
          cause,
        }),
      );

      return ok({ success: true });
    })
      .orTee((e) => e.cause && console.error('[Admin]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  });
