import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { appSettings } from '@/db';
import { requireAdmin } from '../../middleware';
import { zValidator } from '@hono/zod-validator';
import { ResultAsync, ok } from 'neverthrow';
import type { Env } from '../../types';
import type { HandlerError } from '../../lib/error';
import { safeHandler } from '../../lib/safe-handler';

// =============================================================================
// Validation Schemas
// =============================================================================

const patchSchema = z.object({
  signupBonusEnabled: z.boolean().optional(),
  signupBonusCredits: z.number().int().min(0).max(10000).optional(),
  signupBonusCreditExpiresInDays: z.number().int().min(1).max(365).optional(),
});

// =============================================================================
// Routes
// =============================================================================

export const adminSettingsRouter = new Hono<Env>()
  // GET / - Get current settings
  .get('/', requireAdmin(), async (c) => {
    const db = c.var.db();

    return safeHandler(async function* () {
      const [settings] = yield* ResultAsync.fromPromise(
        db.select().from(appSettings).where(eq(appSettings.id, 'global')).limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok(settings ?? null);
    }, c);
  })

  // PATCH / - Update settings (upsert)
  .patch('/', requireAdmin(), zValidator('json', patchSchema), async (c) => {
    const updates = c.req.valid('json');
    const db = c.var.db();

    return safeHandler(async function* () {
      const [settings] = yield* ResultAsync.fromPromise(
        db
          .insert(appSettings)
          .values({
            id: 'global',
            ...updates,
            updatedAt: new Date().toISOString(),
            updatedBy: c.var.adminEmail ?? null,
          })
          .onConflictDoUpdate({
            target: appSettings.id,
            set: {
              ...updates,
              updatedAt: new Date().toISOString(),
              updatedBy: c.var.adminEmail ?? null,
            },
          })
          .returning(),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok(settings);
    }, c);
  });
