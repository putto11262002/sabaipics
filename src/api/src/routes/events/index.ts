import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, desc, sql, and, or, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  events,
  activeEvents,
  photoLuts,
  autoEditPresets,
  DEFAULT_SLIDESHOW_CONFIG,
  logoUploadIntents,
  ftpCredentials,
  type EventSettings,
} from '@/db';
import { requirePhotographer } from '../../middleware';
import type { Env } from '../../types';
import { generatePngQrCode } from '@juit/qrcode';
import { createEventSchema, eventParamsSchema, listEventsQuerySchema } from './schema';
import { slideshowConfigSchema } from './slideshow-schema';
import { logoPresignSchema, logoStatusQuerySchema } from './logo-schema';
import { eventColorGradeSchema } from './color-grade-schema';
import { slideshowSettingsSchema } from './slideshow-settings-schema';
import { eventImagePipelineSchema } from './image-pipeline-schema';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { apiError, type HandlerError } from '../../lib/error';
import { safeHandler } from '../../lib/safe-handler';
import { generatePresignedPutUrl } from '../../lib/r2/presign';
import { createFtpCredentialsWithRetry } from '../../lib/ftp/credentials';
import { hardDeleteEvents } from '../../lib/services/events/hard-delete';
import { capturePostHogEvent } from '../../lib/posthog';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const DEFAULT_COLOR_GRADE_SETTINGS = {
  autoEdit: false,
  autoEditPresetId: null as string | null,
  autoEditIntensity: 75,
  lutId: null as string | null,
  lutIntensity: 75,
  includeLuminance: false,
};

const DEFAULT_IMAGE_PIPELINE_SETTINGS = {
  autoEdit: false,
  autoEditPresetId: null as string | null,
  autoEditIntensity: 75,
  lutId: null as string | null,
  lutIntensity: 75,
  includeLuminance: false,
};

function normalizeColorGradeSettings(colorGrade: EventSettings['colorGrade'] | undefined): {
  lutId: string | null;
  lutIntensity: number;
  includeLuminance: boolean;
} {
  const lutIntensityRaw = colorGrade?.lutIntensity;
  const lutIntensity =
    typeof lutIntensityRaw === 'number' && Number.isFinite(lutIntensityRaw)
      ? lutIntensityRaw
      : DEFAULT_COLOR_GRADE_SETTINGS.lutIntensity;

  return {
    lutId: colorGrade?.lutId ?? DEFAULT_COLOR_GRADE_SETTINGS.lutId,
    lutIntensity: Math.max(0, Math.min(100, Math.round(lutIntensity))),
    includeLuminance: colorGrade?.includeLuminance ?? DEFAULT_COLOR_GRADE_SETTINGS.includeLuminance,
  };
}

function normalizeImagePipelineSettings(colorGrade: EventSettings['colorGrade'] | undefined): {
  autoEdit: boolean;
  autoEditPresetId: string | null;
  autoEditIntensity: number;
  lutId: string | null;
  lutIntensity: number;
  includeLuminance: boolean;
} {
  const lutIntensityRaw = colorGrade?.lutIntensity;
  const lutIntensity =
    typeof lutIntensityRaw === 'number' && Number.isFinite(lutIntensityRaw)
      ? lutIntensityRaw
      : DEFAULT_IMAGE_PIPELINE_SETTINGS.lutIntensity;

  const autoEditIntensityRaw = colorGrade?.autoEditIntensity;
  const autoEditIntensity =
    typeof autoEditIntensityRaw === 'number' && Number.isFinite(autoEditIntensityRaw)
      ? autoEditIntensityRaw
      : DEFAULT_IMAGE_PIPELINE_SETTINGS.autoEditIntensity;

  return {
    autoEdit: colorGrade?.autoEdit ?? DEFAULT_IMAGE_PIPELINE_SETTINGS.autoEdit,
    autoEditPresetId:
      colorGrade?.autoEditPresetId ?? DEFAULT_IMAGE_PIPELINE_SETTINGS.autoEditPresetId,
    autoEditIntensity: Math.max(0, Math.min(100, Math.round(autoEditIntensity))),
    lutId: colorGrade?.lutId ?? DEFAULT_IMAGE_PIPELINE_SETTINGS.lutId,
    lutIntensity: Math.max(0, Math.min(100, Math.round(lutIntensity))),
    includeLuminance:
      colorGrade?.includeLuminance ?? DEFAULT_IMAGE_PIPELINE_SETTINGS.includeLuminance,
  };
}

// QR Code Generation

type QRSize = 'small' | 'medium' | 'large';

const QR_SIZE_PRESETS: Record<QRSize, number> = {
  small: 256,
  medium: 512,
  large: 1200,
} as const;

function getScaleForSize(size: QRSize): number {
  return Math.ceil(QR_SIZE_PRESETS[size] / 25);
}

async function generateEventQR(
  eventId: string,
  baseUrl: string,
  size: QRSize = 'medium',
): Promise<Uint8Array> {
  const searchUrl = `${baseUrl}/participant/events/${eventId}/search`;

  return await generatePngQrCode(searchUrl, {
    ecLevel: 'M',
    margin: 4,
    scale: getScaleForSize(size),
  });
}

// Routes

export const eventsRouter = new Hono<Env>()

  // GET /events/:id/color-grade - Get event color grade settings
  .get(
    '/:id/color-grade',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');

      return safeTry(async function* () {
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id, settings: activeEvents.settings })
            .from(activeEvents)
            .where(and(eq(activeEvents.id, id), eq(activeEvents.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        const settings = (event.settings ?? null) as EventSettings | null;
        const cg = normalizeColorGradeSettings(settings?.colorGrade);

        return ok({
          data: {
            lutId: cg.lutId,
            lutIntensity: cg.lutIntensity,
            includeLuminance: cg.includeLuminance,
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] GET /:id/color-grade', e.code, e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  // PUT /events/:id/color-grade - Update event color grade settings
  .put(
    '/:id/color-grade',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    zValidator('json', eventColorGradeSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      return safeTry(async function* () {
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id, settings: activeEvents.settings })
            .from(activeEvents)
            .where(and(eq(activeEvents.id, id), eq(activeEvents.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        const presetId = (body as { autoEditPresetId?: string }).autoEditPresetId;
        if (presetId) {
          const [preset] = yield* ResultAsync.fromPromise(
            db
              .select({ id: autoEditPresets.id })
              .from(autoEditPresets)
              .where(
                and(
                  eq(autoEditPresets.id, presetId),
                  or(
                    eq(autoEditPresets.photographerId, photographer.id),
                    eq(autoEditPresets.isBuiltin, true),
                  ),
                ),
              )
              .limit(1),
            (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
          );

          if (!preset) {
            return err<never, HandlerError>({
              code: 'NOT_FOUND',
              message: 'Auto-edit preset not found',
            });
          }
        }

        // Validate LUT ownership if provided
        if (body.lutId) {
          const [lut] = yield* ResultAsync.fromPromise(
            db
              .select({ id: photoLuts.id, status: photoLuts.status })
              .from(photoLuts)
              .where(
                and(eq(photoLuts.id, body.lutId), eq(photoLuts.photographerId, photographer.id)),
              )
              .limit(1),
            (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
          );

          if (!lut) {
            return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'LUT not found' });
          }

          if (lut.status !== 'completed') {
            return err<never, HandlerError>({
              code: 'CONFLICT',
              message: 'LUT is not ready',
            });
          }
        }

        const prev = (event.settings ?? null) as EventSettings | null;
        const next: EventSettings = {
          ...(prev ?? {}),
          colorGrade: {
            autoEdit: prev?.colorGrade?.autoEdit ?? false,
            autoEditPresetId: prev?.colorGrade?.autoEditPresetId ?? null,
            autoEditIntensity: prev?.colorGrade?.autoEditIntensity ?? 75,
            lutId: body.lutId,
            lutIntensity: body.lutIntensity,
            includeLuminance: body.includeLuminance,
          },
        };

        const [updated] = yield* ResultAsync.fromPromise(
          db
            .update(events)
            .set({ settings: next })
            .where(
              and(
                eq(events.id, id),
                eq(events.photographerId, photographer.id),
                isNull(events.deletedAt),
              ),
            )
            .returning({ settings: events.settings }),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!updated) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        const normalized = normalizeColorGradeSettings(updated.settings?.colorGrade);

        return ok({
          data: {
            lutId: normalized.lutId,
            lutIntensity: normalized.lutIntensity,
            includeLuminance: normalized.includeLuminance,
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] PUT /:id/color-grade', e.code, e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  // GET /events/:id/slideshow-settings - Get event slideshow settings (template + theme)
  .get(
    '/:id/slideshow-settings',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');

      return safeTry(async function* () {
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id, settings: activeEvents.settings })
            .from(activeEvents)
            .where(and(eq(activeEvents.id, id), eq(activeEvents.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        const settings = (event.settings ?? null) as EventSettings | null;

        // Validate settings at API boundary - use defaults if invalid
        const rawConfig = {
          template: settings?.slideshow?.template ?? 'carousel',
          primaryColor: settings?.theme?.primary ?? '#ff6320',
          background: settings?.theme?.background ?? '#fdfdfd',
        };

        const parseResult = slideshowSettingsSchema.safeParse(rawConfig);
        const config = parseResult.success
          ? parseResult.data
          : {
              template: 'carousel' as const,
              primaryColor: '#ff6320',
              background: '#fdfdfd',
            };

        return ok({ data: config });
      })
        .orTee((e) => e.cause && console.error('[Events] GET /:id/slideshow-settings', e.code, e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  // PUT /events/:id/slideshow-settings - Update event slideshow settings
  .put(
    '/:id/slideshow-settings',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    zValidator('json', slideshowSettingsSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      return safeTry(async function* () {
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id, settings: activeEvents.settings })
            .from(activeEvents)
            .where(and(eq(activeEvents.id, id), eq(activeEvents.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        const prev = (event.settings ?? null) as EventSettings | null;
        const next: EventSettings = {
          ...(prev ?? {}),
          theme: {
            primary: body.primaryColor,
            background: body.background,
          },
          slideshow: {
            template: body.template,
          },
        };

        const [updated] = yield* ResultAsync.fromPromise(
          db
            .update(events)
            .set({ settings: next })
            .where(
              and(
                eq(events.id, id),
                eq(events.photographerId, photographer.id),
                isNull(events.deletedAt),
              ),
            )
            .returning({ settings: events.settings }),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!updated) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        return ok({
          data: {
            template: updated.settings?.slideshow?.template ?? 'carousel',
            primaryColor: updated.settings?.theme?.primary ?? '#ff6320',
            background: updated.settings?.theme?.background ?? '#fdfdfd',
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] PUT /:id/slideshow-settings', e.code, e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  // GET /events/:id/image-pipeline - Get event image pipeline settings
  .get(
    '/:id/image-pipeline',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');

      return safeTry(async function* () {
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id, settings: activeEvents.settings })
            .from(activeEvents)
            .where(and(eq(activeEvents.id, id), eq(activeEvents.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        const settings = (event.settings ?? null) as EventSettings | null;
        const pipeline = normalizeImagePipelineSettings(settings?.colorGrade);

        return ok({
          data: {
            autoEdit: pipeline.autoEdit,
            autoEditPresetId: pipeline.autoEditPresetId,
            autoEditIntensity: pipeline.autoEditIntensity,
            lutId: pipeline.lutId,
            lutIntensity: pipeline.lutIntensity,
            includeLuminance: pipeline.includeLuminance,
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] GET /:id/image-pipeline', e.code, e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  // PUT /events/:id/image-pipeline - Update event image pipeline settings
  .put(
    '/:id/image-pipeline',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    zValidator('json', eventImagePipelineSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      return safeTry(async function* () {
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id, settings: activeEvents.settings })
            .from(activeEvents)
            .where(and(eq(activeEvents.id, id), eq(activeEvents.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Validate LUT ownership if provided
        if (body.lutId) {
          const [lut] = yield* ResultAsync.fromPromise(
            db
              .select({ id: photoLuts.id, status: photoLuts.status })
              .from(photoLuts)
              .where(
                and(eq(photoLuts.id, body.lutId), eq(photoLuts.photographerId, photographer.id)),
              )
              .limit(1),
            (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
          );

          if (!lut) {
            return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'LUT not found' });
          }

          if (lut.status !== 'completed') {
            return err<never, HandlerError>({
              code: 'CONFLICT',
              message: 'LUT is not ready',
            });
          }
        }

        const prev = (event.settings ?? null) as EventSettings | null;
        const next: EventSettings = {
          ...(prev ?? {}),
          colorGrade: {
            autoEdit: body.autoEdit,
            autoEditPresetId: body.autoEditPresetId,
            autoEditIntensity: body.autoEditIntensity,
            lutId: body.lutId,
            lutIntensity: body.lutIntensity,
            includeLuminance: body.includeLuminance,
          },
        };

        const [updated] = yield* ResultAsync.fromPromise(
          db
            .update(events)
            .set({ settings: next })
            .where(
              and(
                eq(events.id, id),
                eq(events.photographerId, photographer.id),
                isNull(events.deletedAt),
              ),
            )
            .returning({ settings: events.settings }),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!updated) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        const normalized = normalizeImagePipelineSettings(updated.settings?.colorGrade);

        return ok({
          data: {
            autoEdit: normalized.autoEdit,
            autoEditPresetId: normalized.autoEditPresetId,
            autoEditIntensity: normalized.autoEditIntensity,
            lutId: normalized.lutId,
            lutIntensity: normalized.lutIntensity,
            includeLuminance: normalized.includeLuminance,
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] PUT /:id/image-pipeline', e.code, e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  .post(
    '/',
    requirePhotographer(),

    zValidator('json', createEventSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const body = c.req.valid('json');

      return safeHandler(
        async function* () {
          // Validate date range
          if (body.startDate && body.endDate && body.startDate > body.endDate) {
            return err<never, HandlerError>({
              code: 'BAD_REQUEST',
              message: 'Start date must be before or equal to end date',
            });
          }

          // Calculate expiry date (30 days from now)
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);

          const encryptionKey = (c.env as unknown as Record<string, string>)
            .FTP_PASSWORD_ENCRYPTION_KEY;
          if (!encryptionKey) {
            return err<never, HandlerError>({
              code: 'INTERNAL_ERROR',
              message: 'FTP password encryption key missing',
            });
          }

          const created = yield* ResultAsync.fromPromise(
            (async () => {
              const dbTx = c.var.dbTx();

              return await dbTx.transaction(async (tx) => {
                const [event] = await tx
                  .insert(events)
                  .values({
                    photographerId: photographer.id,
                    name: body.name,
                    startDate: body.startDate,
                    endDate: body.endDate,
                    qrCodeR2Key: null, // No longer storing QR codes
                    expiresAt: expiresAt.toISOString(),
                  })
                  .returning();

                await createFtpCredentialsWithRetry(encryptionKey, (payload) =>
                  tx.insert(ftpCredentials).values({
                    eventId: event.id,
                    photographerId: photographer.id,
                    username: payload.username,
                    passwordHash: payload.passwordHash,
                    passwordCiphertext: payload.passwordCiphertext,
                    expiresAt: event.expiresAt,
                  }),
                );

                return event;
              });
            })(),
            (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
          );

          try {
            c.executionCtx.waitUntil(
              capturePostHogEvent(c.env.POSTHOG_API_KEY, {
                distinctId: c.get('auth')!.userId,
                event: 'event_created',
                properties: { event_id: created.id },
              }),
            );
          } catch {
            // Hono unit tests do not always provide ExecutionContext.
          }

          return ok({
            id: created.id,
            photographerId: created.photographerId,
            name: created.name,
            startDate: created.startDate,
            endDate: created.endDate,
            qrCodeUrl: null, // Client-side generation
            expiresAt: created.expiresAt,
            createdAt: created.createdAt,
          });
        },
        c,
        { status: 201 },
      );
    },
  )

  .get(
    '/',
    requirePhotographer(),

    zValidator('query', listEventsQuerySchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { page, limit } = c.req.valid('query');

      return safeTry(async function* () {
        const offset = page * limit;

        const eventsList = yield* ResultAsync.fromPromise(
          db
            .select({
              id: activeEvents.id,
              name: activeEvents.name,
              subtitle: activeEvents.subtitle,
              logoR2Key: activeEvents.logoR2Key,
              startDate: activeEvents.startDate,
              endDate: activeEvents.endDate,
              createdAt: activeEvents.createdAt,
              expiresAt: activeEvents.expiresAt,
            })
            .from(activeEvents)
            .where(eq(activeEvents.photographerId, photographer.id))
            .orderBy(desc(activeEvents.createdAt))
            .limit(limit)
            .offset(offset),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        // Get total count for pagination metadata
        const [countResult] = yield* ResultAsync.fromPromise(
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(activeEvents)
            .where(eq(activeEvents.photographerId, photographer.id)),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        const totalCount = countResult?.count ?? 0;
        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page + 1 < totalPages;
        const hasPrevPage = page > 0;

        return ok({
          data: eventsList.map((event) => ({
            ...event,
            logoUrl: event.logoR2Key ? `${c.env.PHOTO_R2_BASE_URL}/${event.logoR2Key}` : null,
            logoR2Key: undefined, // Remove raw key from response
          })),
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNextPage,
            hasPrevPage,
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] GET /', e.code, e.cause))
        .match(
          (result) => c.json(result),
          (e) => apiError(c, e),
        );
    },
  )

  .get(
    '/:id',
    requirePhotographer(),

    zValidator('param', eventParamsSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');

      return safeTry(async function* () {
        const [event] = yield* ResultAsync.fromPromise(
          db.select().from(activeEvents).where(eq(activeEvents.id, id)).limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Authorization: ensure photographer owns this event
        if (event.photographerId !== photographer.id) {
          // Return NOT_FOUND instead of FORBIDDEN to prevent enumeration
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        return ok({
          id: event.id,
          photographerId: event.photographerId,
          name: event.name,
          subtitle: event.subtitle,
          logoUrl: event.logoR2Key ? `${c.env.PHOTO_R2_BASE_URL}/${event.logoR2Key}` : null,
          startDate: event.startDate,
          endDate: event.endDate,
          qrCodeUrl: null, // Client-side generation
          expiresAt: event.expiresAt,
          createdAt: event.createdAt,
        });
      })
        .orTee((e) => e.cause && console.error('[Events] GET /:id', e.code, e.cause))
        .match(
          (data) => c.json({ data }),
          (e) => apiError(c, e),
        );
    },
  )
  // PUT /events/:id - Update event name/subtitle
  .put(
    '/:id',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(200).optional(),
        subtitle: z.string().max(500).nullish(),
      }),
    ),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      return safeTry(async function* () {
        const [event] = yield* ResultAsync.fromPromise(
          db.select().from(activeEvents).where(eq(activeEvents.id, id)).limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event || event.photographerId !== photographer.id) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        const updates: Partial<{ name: string; subtitle: string | null }> = {};
        if (body.name !== undefined) updates.name = body.name;
        if (body.subtitle !== undefined) updates.subtitle = body.subtitle ?? null;

        if (Object.keys(updates).length === 0) {
          return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'No fields to update' });
        }

        const [updated] = yield* ResultAsync.fromPromise(
          db.update(events).set(updates).where(eq(events.id, id)).returning(),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        return ok({
          data: {
            id: updated.id,
            name: updated.name,
            subtitle: updated.subtitle,
            logoUrl: updated.logoR2Key ? `${c.env.PHOTO_R2_BASE_URL}/${updated.logoR2Key}` : null,
            startDate: updated.startDate,
            endDate: updated.endDate,
            qrCodeUrl: null,
            expiresAt: updated.expiresAt,
            createdAt: updated.createdAt,
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] PUT /:id', e.code, e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  // GET /events/:id/qr-download - Download QR code as PNG
  .get(
    '/:id/qr-download',
    requirePhotographer(),

    zValidator('param', eventParamsSchema),
    zValidator(
      'query',
      z.object({
        size: z.enum(['small', 'medium', 'large']).optional().default('medium'),
      }),
    ),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');
      const { size } = c.req.valid('query');

      return safeTry(async function* () {
        const [event] = yield* ResultAsync.fromPromise(
          db.select().from(activeEvents).where(eq(activeEvents.id, id)).limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Authorization: ensure photographer owns this event
        if (event.photographerId !== photographer.id) {
          // Return NOT_FOUND instead of FORBIDDEN to prevent enumeration
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Generate QR code on-demand
        const qrPng = yield* ResultAsync.fromPromise(
          generateEventQR(event.id, c.env.EVENT_FRONTEND_URL, size as QRSize),
          (cause): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate QR code',
            cause,
          }),
        );

        // Return PNG with download headers
        const sanitizedName = event.name.replace(/[^a-z0-9]/gi, '-');
        const filename = `${sanitizedName}-${size}-qr.png`;
        // Convert Uint8Array to regular ArrayBuffer for Response
        const arrayBuffer = new ArrayBuffer(qrPng.length);
        const view = new Uint8Array(arrayBuffer);
        view.set(qrPng);
        return ok(
          new Response(arrayBuffer, {
            headers: {
              'Content-Type': 'image/png',
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            },
          }),
        );
      })
        .orTee((e) => e.cause && console.error('[Events] GET /:id/qr-download', e.code, e.cause))
        .match(
          (response) => response,
          (e) => apiError(c, e),
        );
    },
  )

  .get(
    '/:id/slideshow-config',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');

      return safeTry(async function* () {
        // Verify event ownership
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({
              id: activeEvents.id,
              slideshowConfig: activeEvents.slideshowConfig,
            })
            .from(activeEvents)
            .where(and(eq(activeEvents.id, id), eq(activeEvents.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Return default config if none set
        const config = event.slideshowConfig ?? DEFAULT_SLIDESHOW_CONFIG;

        return ok({ data: config });
      })
        .orTee(
          (e) => e.cause && console.error('[Events] GET /:id/slideshow-config', e.code, e.cause),
        )
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  .put(
    '/:id/slideshow-config',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    zValidator('json', slideshowConfigSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');
      const config = c.req.valid('json');

      return safeTry(async function* () {
        // Verify event ownership
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id })
            .from(activeEvents)
            .where(and(eq(activeEvents.id, id), eq(activeEvents.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Update slideshow config
        const [updated] = yield* ResultAsync.fromPromise(
          db
            .update(events)
            .set({ slideshowConfig: config })
            .where(and(eq(events.id, id), isNull(events.deletedAt)))
            .returning({ slideshowConfig: events.slideshowConfig }),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        return ok({ data: updated.slideshowConfig });
      })
        .orTee(
          (e) => e.cause && console.error('[Events] PUT /:id/slideshow-config', e.code, e.cause),
        )
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  .post(
    '/:id/logo/presign',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    zValidator('json', logoPresignSchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id: eventId } = c.req.valid('param');
      const { contentType, contentLength } = c.req.valid('json');

      return safeTry(async function* () {
        // Verify event ownership and not expired
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id, expiresAt: activeEvents.expiresAt })
            .from(activeEvents)
            .where(
              and(eq(activeEvents.id, eventId), eq(activeEvents.photographerId, photographer.id)),
            )
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Check if event expired
        if (new Date(event.expiresAt) < new Date()) {
          return err<never, HandlerError>({ code: 'GONE', message: 'Event has expired' });
        }

        // Generate upload ID and R2 key
        const uploadId = crypto.randomUUID();
        const timestamp = Date.now();
        const r2Key = `logos/${uploadId}-${timestamp}`;

        // Generate presigned URL (5 minutes expiry)
        const PRESIGN_EXPIRY_SECONDS = 5 * 60;
        const expiresAt = new Date(Date.now() + PRESIGN_EXPIRY_SECONDS * 1000);

        const { url: putUrl } = yield* ResultAsync.fromPromise(
          generatePresignedPutUrl(
            c.env.CF_ACCOUNT_ID,
            c.env.R2_ACCESS_KEY_ID,
            c.env.R2_SECRET_ACCESS_KEY,
            {
              bucket: c.env.PHOTO_BUCKET_NAME,
              key: r2Key,
              contentType,
              contentLength,
              expiresIn: PRESIGN_EXPIRY_SECONDS,
            },
          ),
          (cause): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate upload URL',
            cause,
          }),
        );

        // Create logo upload intent record
        yield* ResultAsync.fromPromise(
          db.insert(logoUploadIntents).values({
            id: uploadId,
            photographerId: photographer.id,
            eventId,
            r2Key,
            contentType,
            contentLength,
            status: 'pending',
            expiresAt: expiresAt.toISOString(),
          }),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        return ok({
          data: {
            uploadId,
            putUrl,
            objectKey: r2Key,
            expiresAt: expiresAt.toISOString(),
            requiredHeaders: {
              'Content-Type': contentType,
              'Content-Length': contentLength.toString(),
              'If-None-Match': '*',
            },
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] POST /:id/logo/presign', e.code, e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  .get(
    '/:id/logo/status',
    requirePhotographer(),
    zValidator('param', eventParamsSchema),
    zValidator('query', logoStatusQuerySchema),
    async (c) => {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id: eventId } = c.req.valid('param');
      const { id: uploadId } = c.req.valid('query');

      return safeTry(async function* () {
        // Verify event ownership
        const [event] = yield* ResultAsync.fromPromise(
          db
            .select({ id: activeEvents.id, logoR2Key: activeEvents.logoR2Key })
            .from(activeEvents)
            .where(
              and(eq(activeEvents.id, eventId), eq(activeEvents.photographerId, photographer.id)),
            )
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!event) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        // Fetch logo upload intent
        const [intent] = yield* ResultAsync.fromPromise(
          db
            .select({
              uploadId: logoUploadIntents.id,
              eventId: logoUploadIntents.eventId,
              status: logoUploadIntents.status,
              errorCode: logoUploadIntents.errorCode,
              errorMessage: logoUploadIntents.errorMessage,
              completedAt: logoUploadIntents.completedAt,
              expiresAt: logoUploadIntents.expiresAt,
            })
            .from(logoUploadIntents)
            .where(
              and(
                eq(logoUploadIntents.id, uploadId),
                eq(logoUploadIntents.eventId, eventId),
                eq(logoUploadIntents.photographerId, photographer.id),
              ),
            )
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!intent) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Upload not found' });
        }

        // Generate logo URL if completed
        const logoUrl =
          intent.status === 'completed' && event.logoR2Key
            ? `${c.env.PHOTO_R2_BASE_URL}/${event.logoR2Key}`
            : null;

        return ok({
          data: {
            uploadId: intent.uploadId,
            eventId: intent.eventId,
            status: intent.status,
            errorCode: intent.errorCode,
            errorMessage: intent.errorMessage,
            logoUrl,
            completedAt: intent.completedAt,
            expiresAt: intent.expiresAt,
          },
        });
      })
        .orTee((e) => e.cause && console.error('[Events] GET /:id/logo/status', e.code, e.cause))
        .match(
          (data) => c.json(data),
          (e) => apiError(c, e),
        );
    },
  )

  .delete('/:id/logo', requirePhotographer(), zValidator('param', eventParamsSchema), async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.db();
    const { id: eventId } = c.req.valid('param');

    return safeTry(async function* () {
      // Verify event ownership
      const [event] = yield* ResultAsync.fromPromise(
        db
          .select({ id: activeEvents.id })
          .from(activeEvents)
          .where(
            and(eq(activeEvents.id, eventId), eq(activeEvents.photographerId, photographer.id)),
          )
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!event) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      // Remove logo reference (actual R2 cleanup via lifecycle policy)
      yield* ResultAsync.fromPromise(
        db
          .update(events)
          .set({ logoR2Key: null })
          .where(and(eq(events.id, eventId), isNull(events.deletedAt))),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({ data: { success: true } });
    })
      .orTee((e) => e.cause && console.error('[Events] DELETE /:id/logo', e.code, e.cause))
      .match(
        (data) => c.json(data),
        (e) => apiError(c, e),
      );
  })

  .delete('/:id/hard', requirePhotographer(), zValidator('param', eventParamsSchema), async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.dbTx(); // Use WebSocket adapter for transaction support
    const { id } = c.req.valid('param');

    // DEV-ONLY: Block in staging/production
    if (c.env.NODE_ENV !== 'development') {
      return apiError(c, 'FORBIDDEN', 'Hard delete is only available in development');
    }

    return safeTry(async function* () {
      // Verify event ownership (from base table, allow soft-deleted events)
      const [event] = yield* ResultAsync.fromPromise(
        db
          .select({
            id: events.id,
          })
          .from(events)
          .where(and(eq(events.id, id), eq(events.photographerId, photographer.id)))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!event) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      // Hard delete all related data (batch function with single ID)
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

      // Check if deletion succeeded
      const result = results[0];
      if (!result || !result.success) {
        const errorMsg = result?.error ? `${result.error.type}` : 'Hard delete failed';
        return err<never, HandlerError>({
          code: 'INTERNAL_ERROR',
          message: errorMsg,
        });
      }

      return ok({ data: result });
    })
      .orTee((e) => e.cause && console.error('[Events] DELETE /:id/hard', e.code, e.cause))
      .match(
        (data) => c.json(data),
        (e) => apiError(c, e),
      );
  })

  .delete('/:id', requirePhotographer(), zValidator('param', eventParamsSchema), async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.db();
    const { id } = c.req.valid('param');

    return safeTry(async function* () {
      // Verify event ownership and not already deleted
      const [event] = yield* ResultAsync.fromPromise(
        db
          .select({ id: activeEvents.id })
          .from(activeEvents)
          .where(and(eq(activeEvents.id, id), eq(activeEvents.photographerId, photographer.id)))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!event) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      // Soft delete event
      const deletedAt = new Date().toISOString();
      yield* ResultAsync.fromPromise(
        db
          .update(events)
          .set({ deletedAt })
          .where(and(eq(events.id, id), isNull(events.deletedAt))),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({ data: { deletedAt } });
    })
      .orTee((e) => e.cause && console.error('[Events] DELETE /:id', e.code, e.cause))
      .match(
        (data) => c.json(data),
        (e) => apiError(c, e),
      );
  });
