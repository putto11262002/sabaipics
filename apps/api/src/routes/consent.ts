import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { consentRecords, photographers } from '@sabaipics/db';
import { requirePhotographer } from '../middleware';
import type { Env } from '../types';
import { apiError, type HandlerError } from '../lib/error';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';

// =============================================================================
// Routes
// =============================================================================

export const consentRouter = new Hono<Env>()
  // GET / - Check consent status
  .get('/', requirePhotographer(), (c) => {
    const photographer = c.var.photographer;
    return c.json({
      data: {
        isConsented: !!photographer.pdpaConsentAt,
        consentedAt: photographer.pdpaConsentAt,
      },
    });
  })
  // POST / - Record PDPA consent
  .post('/', requirePhotographer(), async (c) => {
    const photographer = c.var.photographer;
    const dbTx = c.var.dbTx();

    // Get client IP from Cloudflare header
    const ipAddress = c.req.header('CF-Connecting-IP') ?? null;

    // Transaction: Insert consent record + update photographer
    const now = new Date().toISOString();

    return safeTry(async function* () {
      // Check if already consented
      if (photographer.pdpaConsentAt) {
        return err<never, HandlerError>({
          code: 'CONFLICT',
          message: 'PDPA consent already recorded',
        });
      }

      const consentRecord = yield* ResultAsync.fromPromise(
        dbTx.transaction(async (tx) => {
          // Insert consent record
          const [record] = await tx
            .insert(consentRecords)
            .values({
              photographerId: photographer.id,
              consentType: 'pdpa',
              ipAddress,
            })
            .returning({
              id: consentRecords.id,
              consentType: consentRecords.consentType,
              createdAt: consentRecords.createdAt,
            });

          // Update photographer with consent timestamp
          await tx
            .update(photographers)
            .set({ pdpaConsentAt: now })
            .where(eq(photographers.id, photographer.id));

          return record;
        }),
        (cause): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Failed to record consent',
          cause,
        }),
      );

      return ok(consentRecord);
    })
      .orTee((e) => e.cause && console.error('[Consent]', e.code, e.cause))
      .match(
        (data) => c.json({ data }, 201),
        (e) => apiError(c, e),
      );
  });
