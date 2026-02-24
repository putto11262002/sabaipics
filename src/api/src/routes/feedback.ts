import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { ResultAsync, safeTry, ok } from 'neverthrow';
import { feedback, feedbackCategories, feedbackSources } from '@/db';
import { requirePhotographer } from '../middleware';
import type { Env } from '../types';
import { apiError, type HandlerError } from '../lib/error';

// =============================================================================
// Validation Schemas
// =============================================================================

const submitSchema = z.object({
  content: z.string().min(1).max(5000),
  category: z.enum(feedbackCategories).optional().default('general'),
  source: z.enum(feedbackSources),
  eventId: z.string().uuid().optional(),
});

// =============================================================================
// Routes
// =============================================================================

export const feedbackRouter = new Hono<Env>()
  // POST / — Submit feedback (requires photographer auth)
  .post(
    '/',
    requirePhotographer(),
    zValidator('json', submitSchema),
    async (c) => {
      const input = c.req.valid('json');
      const db = c.var.db();
      const photographerId = c.var.photographer.id;

      return safeTry(async function* () {
        const [created] = yield* ResultAsync.fromPromise(
          db
            .insert(feedback)
            .values({
              content: input.content,
              category: input.category,
              source: input.source,
              eventId: input.eventId,
              photographerId,
            })
            .returning(),
          (cause): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to submit feedback',
            cause,
          }),
        );

        return ok(created);
      })
        .orTee((e) => e.cause && console.error('[Feedback]', e.code, e.cause))
        .match(
          (data) => c.json({ data }, 201),
          (e) => apiError(c, e),
        );
    },
  );
