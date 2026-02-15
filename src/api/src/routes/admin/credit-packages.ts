import { Hono } from 'hono';
import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { creditPackages } from '@/db';
import { requireAdmin } from '../../middleware';
import { zValidator } from '@hono/zod-validator';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';

// =============================================================================
// Validation Schemas
// =============================================================================

const createPackageSchema = z.object({
  name: z.string().min(1).max(100),
  credits: z.number().int().positive(),
  priceThb: z.number().int().positive(),
  active: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const updatePackageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  credits: z.number().int().positive().optional(),
  priceThb: z.number().int().positive().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// =============================================================================
// Routes
// =============================================================================

export const adminCreditPackagesRouter = new Hono<Env>()
  // GET / - List all packages
  .get('/', requireAdmin(), async (c) => {
    const db = c.var.db();

    return safeTry(async function* () {
      const packages = yield* ResultAsync.fromPromise(
        db.select().from(creditPackages).orderBy(asc(creditPackages.sortOrder)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok(packages);
    })
      .orTee((e) => e.cause && console.error('[Admin]', e.code, e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })
  // POST / - Create package
  .post('/', requireAdmin(), zValidator('json', createPackageSchema), async (c) => {
    const data = c.req.valid('json');
    const db = c.var.db();

    return safeTry(async function* () {
      const [created] = yield* ResultAsync.fromPromise(
        db
          .insert(creditPackages)
          .values({
            name: data.name,
            credits: data.credits,
            priceThb: data.priceThb,
            active: data.active,
            sortOrder: data.sortOrder,
          })
          .returning(),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok(created);
    })
      .orTee((e) => e.cause && console.error('[Admin]', e.code, e.cause))
      .match(
        (data) => c.json({ data }, 201),
        (e) => apiError(c, e),
      );
  })
  // PATCH /:id - Update package
  .patch(
    '/:id',
    requireAdmin(),
    zValidator('json', updatePackageSchema),
    zValidator('param', z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid('param');
      const data = c.req.valid('json');
      const db = c.var.db();

      return safeTry(async function* () {
        // Check if package exists
        const [existing] = yield* ResultAsync.fromPromise(
          db
            .select({ id: creditPackages.id })
            .from(creditPackages)
            .where(eq(creditPackages.id, id))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!existing) {
          return err<never, HandlerError>({
            code: 'NOT_FOUND',
            message: 'Credit package not found',
          });
        }

        // Update package
        const [updated] = yield* ResultAsync.fromPromise(
          db.update(creditPackages).set(data).where(eq(creditPackages.id, id)).returning(),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        return ok(updated);
      })
        .orTee((e) => e.cause && console.error('[Admin]', e.code, e.cause))
        .match(
          (data) => c.json({ data }),
          (e) => apiError(c, e),
        );
    },
  );
