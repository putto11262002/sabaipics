import { Hono } from 'hono';
import { z } from 'zod';
import {
  eq,
  desc,
  sql,
  and,
  ilike,
  or,
  lt,
  gt as drizzleGt,
} from 'drizzle-orm';
import { giftCodes, giftCodeRedemptions, photographers } from '@/db';
import { requireAdmin } from '../../middleware';
import { zValidator } from '@hono/zod-validator';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';

// =============================================================================
// Validation Schemas
// =============================================================================

const createSchema = z.object({
  credits: z.number().int().min(1).max(100_000),
  code: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[A-Z0-9-]+$/, 'Code must be uppercase alphanumeric with hyphens')
    .optional(),
  description: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
  creditExpiresInDays: z.number().int().min(1).max(3650).optional().default(180),
  maxRedemptions: z.number().int().min(1).optional(),
  maxRedemptionsPerUser: z.number().int().min(1).optional().default(1),
  targetPhotographerIds: z.array(z.string().uuid()).optional(),
});

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['all', 'active', 'inactive', 'expired']).optional().default('all'),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const updateSchema = z.object({
  active: z.boolean().optional(),
  description: z.string().max(500).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  maxRedemptionsPerUser: z.number().int().min(1).optional(),
  creditExpiresInDays: z.number().int().min(1).max(3650).optional(),
  targetPhotographerIds: z.array(z.string().uuid()).nullable().optional(),
});

const redemptionsQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a secure 6-character alphanumeric code.
 * Excludes ambiguous characters (0, O, 1, I, L).
 */
function generateSecureCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// =============================================================================
// Routes
// =============================================================================

export const giftCodesV2Router = new Hono<Env>()
  // POST / — Create gift code
  .post('/', requireAdmin(), zValidator('json', createSchema), async (c) => {
    const input = c.req.valid('json');
    const db = c.var.db();
    const adminEmail = c.var.adminEmail ?? 'dev@admin.local';

    return safeTry(async function* () {
      const code = input.code ?? `GIFT-${generateSecureCode()}`;

      // Check code uniqueness
      const [existing] = yield* ResultAsync.fromPromise(
        db
          .select({ id: giftCodes.id })
          .from(giftCodes)
          .where(eq(giftCodes.code, code))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (existing) {
        return err<never, HandlerError>({
          code: 'CONFLICT',
          message: `Code "${code}" already exists`,
        });
      }

      const [created] = yield* ResultAsync.fromPromise(
        db
          .insert(giftCodes)
          .values({
            code,
            credits: input.credits,
            description: input.description,
            expiresAt: input.expiresAt,
            creditExpiresInDays: input.creditExpiresInDays,
            maxRedemptions: input.maxRedemptions,
            maxRedemptionsPerUser: input.maxRedemptionsPerUser,
            targetPhotographerIds: input.targetPhotographerIds,
            active: true,
            createdBy: adminEmail,
          })
          .returning(),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to create gift code', cause }),
      );

      return ok(created);
    })
      .orTee((e) => e.cause && console.error('[Admin/GiftCodesV2]', e.code, e.cause))
      .match(
        (data) => c.json({ data }, 201),
        (e) => apiError(c, e),
      );
  })

  // GET / — List gift codes with search, status filter, and cursor pagination
  .get('/', requireAdmin(), zValidator('query', listQuerySchema), async (c) => {
    const { search, status, cursor, limit } = c.req.valid('query');
    const db = c.var.db();

    return safeTry(async function* () {
      const conditions = [];
      const now = new Date().toISOString();

      switch (status) {
        case 'active':
          conditions.push(eq(giftCodes.active, true));
          conditions.push(
            or(
              sql`${giftCodes.expiresAt} IS NULL`,
              drizzleGt(giftCodes.expiresAt, now),
            )!,
          );
          break;
        case 'inactive':
          conditions.push(eq(giftCodes.active, false));
          break;
        case 'expired':
          conditions.push(lt(giftCodes.expiresAt, now));
          break;
        // 'all' — no filter
      }

      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            ilike(giftCodes.code, pattern),
            ilike(giftCodes.description, pattern),
          )!,
        );
      }

      if (cursor) {
        conditions.push(lt(giftCodes.createdAt, cursor));
      }

      // Subquery for redemption counts
      const redemptionCountSq = db
        .select({
          giftCodeId: giftCodeRedemptions.giftCodeId,
          count: sql<number>`count(*)`.mapWith(Number).as('redemption_count'),
        })
        .from(giftCodeRedemptions)
        .groupBy(giftCodeRedemptions.giftCodeId)
        .as('redemption_counts');

      const rows = yield* ResultAsync.fromPromise(
        db
          .select({
            id: giftCodes.id,
            code: giftCodes.code,
            credits: giftCodes.credits,
            description: giftCodes.description,
            expiresAt: giftCodes.expiresAt,
            creditExpiresInDays: giftCodes.creditExpiresInDays,
            maxRedemptions: giftCodes.maxRedemptions,
            maxRedemptionsPerUser: giftCodes.maxRedemptionsPerUser,
            active: giftCodes.active,
            createdBy: giftCodes.createdBy,
            createdAt: giftCodes.createdAt,
            redemptionCount: sql<number>`coalesce(${redemptionCountSq.count}, 0)`.mapWith(Number),
          })
          .from(giftCodes)
          .leftJoin(redemptionCountSq, eq(giftCodes.id, redemptionCountSq.giftCodeId))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(giftCodes.createdAt))
          .limit(limit + 1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].createdAt : null;

      return ok({ data, nextCursor });
    })
      .orTee((e) => e.cause && console.error('[Admin/GiftCodesV2]', e.code, e.cause))
      .match(
        (result) => c.json({ data: result.data, nextCursor: result.nextCursor }),
        (e) => apiError(c, e),
      );
  })

  // GET /:id — Gift code detail + stats
  .get('/:id', requireAdmin(), zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = c.var.db();

    return safeTry(async function* () {
      const [code] = yield* ResultAsync.fromPromise(
        db.select().from(giftCodes).where(eq(giftCodes.id, id)).limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!code) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Gift code not found' });
      }

      const [stats] = yield* ResultAsync.fromPromise(
        db
          .select({
            totalRedemptions: sql<number>`count(*)`.mapWith(Number),
            totalCreditsIssued: sql<number>`coalesce(sum(${giftCodeRedemptions.creditsGranted}), 0)`.mapWith(Number),
            uniqueUsers: sql<number>`count(distinct ${giftCodeRedemptions.photographerId})`.mapWith(Number),
          })
          .from(giftCodeRedemptions)
          .where(eq(giftCodeRedemptions.giftCodeId, id)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({
        ...code,
        stats: {
          totalRedemptions: stats?.totalRedemptions ?? 0,
          totalCreditsIssued: stats?.totalCreditsIssued ?? 0,
          uniqueUsers: stats?.uniqueUsers ?? 0,
        },
      });
    })
      .orTee((e) => e.cause && console.error('[Admin/GiftCodesV2]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // PATCH /:id — Update gift code
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
        // Check exists
        const [existing] = yield* ResultAsync.fromPromise(
          db
            .select({ id: giftCodes.id })
            .from(giftCodes)
            .where(eq(giftCodes.id, id))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!existing) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Gift code not found' });
        }

        // Build update object — only include provided fields
        const updates: Partial<typeof giftCodes.$inferInsert> = {};
        if (input.active !== undefined) updates.active = input.active;
        if (input.description !== undefined) updates.description = input.description;
        if (input.expiresAt !== undefined) updates.expiresAt = input.expiresAt;
        if (input.maxRedemptions !== undefined) updates.maxRedemptions = input.maxRedemptions;
        if (input.maxRedemptionsPerUser !== undefined) updates.maxRedemptionsPerUser = input.maxRedemptionsPerUser;
        if (input.creditExpiresInDays !== undefined) updates.creditExpiresInDays = input.creditExpiresInDays;
        if (input.targetPhotographerIds !== undefined) updates.targetPhotographerIds = input.targetPhotographerIds;

        if (Object.keys(updates).length === 0) {
          return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'No fields to update' });
        }

        const [updated] = yield* ResultAsync.fromPromise(
          db
            .update(giftCodes)
            .set(updates)
            .where(eq(giftCodes.id, id))
            .returning(),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to update gift code', cause }),
        );

        return ok(updated);
      })
        .orTee((e) => e.cause && console.error('[Admin/GiftCodesV2]', e.code, e.cause))
        .match(
          (data) => c.json({ data }),
          (e) => apiError(c, e),
        );
    },
  )

  // GET /:id/redemptions — Paginated redemptions with photographer info
  .get(
    '/:id/redemptions',
    requireAdmin(),
    zValidator('param', idParamSchema),
    zValidator('query', redemptionsQuerySchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const { cursor, limit } = c.req.valid('query');
      const db = c.var.db();

      return safeTry(async function* () {
        // Verify gift code exists
        const [code] = yield* ResultAsync.fromPromise(
          db
            .select({ id: giftCodes.id })
            .from(giftCodes)
            .where(eq(giftCodes.id, id))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!code) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Gift code not found' });
        }

        const conditions = [eq(giftCodeRedemptions.giftCodeId, id)];
        if (cursor) {
          conditions.push(lt(giftCodeRedemptions.redeemedAt, cursor));
        }

        const rows = yield* ResultAsync.fromPromise(
          db
            .select({
              id: giftCodeRedemptions.id,
              creditsGranted: giftCodeRedemptions.creditsGranted,
              redeemedAt: giftCodeRedemptions.redeemedAt,
              photographer: {
                id: photographers.id,
                name: photographers.name,
                email: photographers.email,
              },
            })
            .from(giftCodeRedemptions)
            .innerJoin(photographers, eq(giftCodeRedemptions.photographerId, photographers.id))
            .where(and(...conditions))
            .orderBy(desc(giftCodeRedemptions.redeemedAt))
            .limit(limit + 1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        const hasMore = rows.length > limit;
        const data = hasMore ? rows.slice(0, limit) : rows;
        const nextCursor = hasMore ? data[data.length - 1].redeemedAt : null;

        return ok({ data, nextCursor });
      })
        .orTee((e) => e.cause && console.error('[Admin/GiftCodesV2]', e.code, e.cause))
        .match(
          (result) => c.json({ data: result.data, nextCursor: result.nextCursor }),
          (e) => apiError(c, e),
        );
    },
  );
