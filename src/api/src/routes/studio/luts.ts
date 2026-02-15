import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { activeEvents, photoLuts } from '@/db';
import { Result, ResultAsync, err, ok, safeTry } from 'neverthrow';
import { PhotonImage, SamplingFilter, resize } from '@cf-wasm/photon/workerd';

import { requirePhotographer } from '../../middleware';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';
import { generatePresignedGetUrl, generatePresignedPutUrl } from '../../lib/r2/presign';
import {
  applyCubeLutToRgba,
  extractJpegDimensions,
  extractPngDimensions,
  extractWebpDimensions,
  parseCubeLut,
  validateImageMagicBytes,
} from '../../lib/images';

// =============================================================================
// Constants
// =============================================================================

const PRESIGN_TTL_SECONDS = 300; // 5 minutes
const PREVIEW_MAX_WIDTH = 1200;
const PREVIEW_MAX_HEIGHT = 1200;
const PREVIEW_JPEG_QUALITY = 85;
const PREVIEW_MAX_PIXELS = 20_000_000; // guard against huge images (e.g. > ~20MP)
const ALLOWED_REFERENCE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// =============================================================================
// Schemas
// =============================================================================

const lutIdQuerySchema = z.object({
  id: z.string().uuid('Invalid LUT ID'),
});

const lutIdParamSchema = z.object({
  id: z.string().uuid('Invalid LUT ID'),
});

const listLutsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(200),
});

const cubePresignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contentLength: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});

const referencePresignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contentType: z.enum(ALLOWED_REFERENCE_MIME_TYPES),
  contentLength: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
});

const renameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const previewFormSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0, 'File cannot be empty')
    .refine((f) => f.size <= 15 * 1024 * 1024, 'File too large')
    .refine(
      (f) =>
        ALLOWED_REFERENCE_MIME_TYPES.includes(
          f.type as (typeof ALLOWED_REFERENCE_MIME_TYPES)[number],
        ),
      `File type must be one of: ${ALLOWED_REFERENCE_MIME_TYPES.join(', ')}`,
    ),
  intensity: z.coerce.number().int().min(0).max(100).default(75),
  includeLuminance: z
    .preprocess((val) => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        const v = val.trim().toLowerCase();
        if (v === 'true' || v === '1' || v === 'yes') return true;
        if (v === 'false' || v === '0' || v === 'no') return false;
      }
      return undefined;
    }, z.boolean().optional())
    .default(false),
});

// =============================================================================
// Helpers
// =============================================================================

const safePhotonDecode = Result.fromThrowable(
  (bytes: Uint8Array) => PhotonImage.new_from_byteslice(bytes),
  (cause): HandlerError => ({ code: 'UNPROCESSABLE', message: 'Failed to decode image', cause }),
);

const safePhotonResize = Result.fromThrowable(
  (img: PhotonImage, w: number, h: number) => resize(img, w, h, SamplingFilter.Lanczos3),
  (cause): HandlerError => ({ code: 'UNPROCESSABLE', message: 'Failed to resize image', cause }),
);

const safeEncodeJpegBytes = Result.fromThrowable(
  (img: PhotonImage) => img.get_bytes_jpeg(PREVIEW_JPEG_QUALITY).slice(),
  (cause): HandlerError => ({ code: 'UNPROCESSABLE', message: 'Failed to encode JPEG', cause }),
);

async function transformToPreviewJpeg(params: {
  images: ImagesBinding;
  bytes: Uint8Array;
}): Promise<Uint8Array> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(params.bytes);
      controller.close();
    },
  });

  const response = await params.images
    .input(stream)
    .transform({
      width: PREVIEW_MAX_WIDTH,
      height: PREVIEW_MAX_HEIGHT,
      fit: 'scale-down',
    })
    .output({ format: 'image/jpeg', quality: PREVIEW_JPEG_QUALITY });

  const buf = await response.response().arrayBuffer();
  return new Uint8Array(buf);
}

function generatePreviewJpegBytes(params: {
  sampleBytes: Uint8Array;
  lutText: string;
  intensity: number;
  includeLuminance: boolean;
}): Result<Uint8Array, HandlerError> {
  const magic = validateImageMagicBytes(params.sampleBytes.slice(0, 16));
  if (!magic.valid) {
    return err({
      code: 'UNPROCESSABLE',
      message: 'Invalid image format (magic bytes check failed)',
    });
  }

  if (magic.detectedType !== 'image/jpeg') {
    return err({
      code: 'UNPROCESSABLE',
      message: 'Preview sample must be JPEG (internal)',
    });
  }

  const parsed = parseCubeLut(params.lutText);
  if (parsed.isErr()) {
    return err({ code: 'UNPROCESSABLE', message: parsed.error.message });
  }

  // Preflight dimension checks before decode.
  const sampleBuffer = params.sampleBytes.buffer.slice(
    params.sampleBytes.byteOffset,
    params.sampleBytes.byteOffset + params.sampleBytes.byteLength,
  ) as ArrayBuffer;
  const jpegDims = extractJpegDimensions(sampleBuffer);
  if (jpegDims) {
    if (jpegDims.width * jpegDims.height > PREVIEW_MAX_PIXELS) {
      return err({
        code: 'UNPROCESSABLE',
        message: `Image is too large (${jpegDims.width}x${jpegDims.height}). Please upload a smaller sample for preview.`,
      });
    }
  }

  let input: PhotonImage | null = null;
  let resized: PhotonImage | null = null;
  let outImg: PhotonImage | null = null;

  const cleanup = () => {
    try {
      outImg?.free();
    } catch {}
    try {
      resized?.free();
    } catch {}
    try {
      input?.free();
    } catch {}
    outImg = null;
    resized = null;
    input = null;
  };

  try {
    const decoded = safePhotonDecode(params.sampleBytes);
    if (decoded.isErr()) return err(decoded.error);
    input = decoded.value;

    const origW = input.get_width();
    const origH = input.get_height();

    if (origW * origH > PREVIEW_MAX_PIXELS) {
      return err({
        code: 'UNPROCESSABLE',
        message: `Image is too large (${origW}x${origH}). Please upload a smaller sample for preview.`,
      });
    }

    let working = input;
    if (origW > PREVIEW_MAX_WIDTH) {
      const scale = PREVIEW_MAX_WIDTH / origW;
      const newH = Math.max(1, Math.round(input.get_height() * scale));
      const r = safePhotonResize(input, PREVIEW_MAX_WIDTH, newH);
      if (r.isErr()) return err(r.error);
      resized = r.value;
      working = resized;
    }

    const width = working.get_width();
    const height = working.get_height();
    const pixels = working.get_raw_pixels().slice();
    const gradedPixels = applyCubeLutToRgba(pixels, parsed.value, {
      intensity: params.intensity,
      includeLuminance: params.includeLuminance,
    });

    outImg = new PhotonImage(gradedPixels, width, height);
    const jpeg = safeEncodeJpegBytes(outImg);
    if (jpeg.isErr()) return err(jpeg.error);

    return ok(jpeg.value);
  } finally {
    cleanup();
  }
}

// =============================================================================
// Routes
// =============================================================================

export const studioLutsRouter = new Hono<Env>()
  // GET /studio/luts
  .get('/', requirePhotographer(), zValidator('query', listLutsQuerySchema), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { limit } = c.req.valid('query');

      const rows = yield* ResultAsync.fromPromise(
        db
          .select({
            id: photoLuts.id,
            name: photoLuts.name,
            sourceType: photoLuts.sourceType,
            status: photoLuts.status,
            createdAt: photoLuts.createdAt,
            completedAt: photoLuts.completedAt,
            errorCode: photoLuts.errorCode,
            errorMessage: photoLuts.errorMessage,
            lutSize: photoLuts.lutSize,
            title: photoLuts.title,
            sha256: photoLuts.sha256,
          })
          .from(photoLuts)
          .where(eq(photoLuts.photographerId, photographer.id))
          .orderBy(desc(photoLuts.createdAt))
          .limit(limit),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          sourceType: r.sourceType,
          status: r.status,
          createdAt: new Date(r.createdAt).toISOString(),
          completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
          errorCode: r.errorCode ?? null,
          errorMessage: r.errorMessage ?? null,
          lutSize: r.lutSize ?? null,
          title: r.title ?? null,
          sha256: r.sha256 ?? null,
        })),
      );
    })
      .orTee((e) => e.cause && console.error('[studio/luts] error:', e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // POST /studio/luts/cube/presign
  .post(
    '/cube/presign',
    requirePhotographer(),
    zValidator('json', cubePresignSchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;
        const db = c.var.db();
        const { name, contentLength } = c.req.valid('json');

        const lutId = crypto.randomUUID();
        const ts = Date.now();
        const uploadR2Key = `lut-uploads/${lutId}-${ts}`;
        const contentType = 'text/plain';

        const presign = yield* ResultAsync.fromPromise(
          generatePresignedPutUrl(
            c.env.CF_ACCOUNT_ID,
            c.env.R2_ACCESS_KEY_ID,
            c.env.R2_SECRET_ACCESS_KEY,
            {
              bucket: c.env.PHOTO_BUCKET_NAME,
              key: uploadR2Key,
              contentType,
              contentLength,
              expiresIn: PRESIGN_TTL_SECONDS,
            },
          ),
          (cause): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate upload URL',
            cause,
          }),
        );

        yield* ResultAsync.fromPromise(
          db
            .insert(photoLuts)
            .values({
              id: lutId,
              photographerId: photographer.id,
              name,
              sourceType: 'cube',
              status: 'pending',
              uploadR2Key,
              contentType,
              contentLength,
              expiresAt: presign.expiresAt.toISOString(),
            })
            .returning({ id: photoLuts.id }),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        return ok({
          lutId,
          putUrl: presign.url,
          objectKey: uploadR2Key,
          expiresAt: presign.expiresAt.toISOString(),
          requiredHeaders: {
            'Content-Type': contentType,
            'Content-Length': contentLength.toString(),
            'If-None-Match': '*',
          },
        });
      })
        .orTee((e) => e.cause && console.error('[studio/luts/cube/presign] error:', e.cause))
        .match(
          (data) => c.json({ data }, 201),
          (e) => apiError(c, e),
        );
    },
  )

  // POST /studio/luts/reference/presign
  .post(
    '/reference/presign',
    requirePhotographer(),
    zValidator('json', referencePresignSchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;
        const db = c.var.db();
        const { name, contentType, contentLength } = c.req.valid('json');

        const lutId = crypto.randomUUID();
        const ts = Date.now();
        const uploadR2Key = `lut-uploads/${lutId}-${ts}`;

        const presign = yield* ResultAsync.fromPromise(
          generatePresignedPutUrl(
            c.env.CF_ACCOUNT_ID,
            c.env.R2_ACCESS_KEY_ID,
            c.env.R2_SECRET_ACCESS_KEY,
            {
              bucket: c.env.PHOTO_BUCKET_NAME,
              key: uploadR2Key,
              contentType,
              contentLength,
              expiresIn: PRESIGN_TTL_SECONDS,
            },
          ),
          (cause): HandlerError => ({
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate upload URL',
            cause,
          }),
        );

        yield* ResultAsync.fromPromise(
          db
            .insert(photoLuts)
            .values({
              id: lutId,
              photographerId: photographer.id,
              name,
              sourceType: 'reference_image',
              status: 'pending',
              uploadR2Key,
              contentType,
              contentLength,
              expiresAt: presign.expiresAt.toISOString(),
            })
            .returning({ id: photoLuts.id }),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        return ok({
          lutId,
          putUrl: presign.url,
          objectKey: uploadR2Key,
          expiresAt: presign.expiresAt.toISOString(),
          requiredHeaders: {
            'Content-Type': contentType,
            'Content-Length': contentLength.toString(),
            'If-None-Match': '*',
          },
        });
      })
        .orTee((e) => e.cause && console.error('[studio/luts/reference/presign] error:', e.cause))
        .match(
          (data) => c.json({ data }, 201),
          (e) => apiError(c, e),
        );
    },
  )

  // GET /studio/luts/status?id=<uuid>
  .get('/status', requirePhotographer(), zValidator('query', lutIdQuerySchema), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('query');

      const [lut] = yield* ResultAsync.fromPromise(
        db
          .select({
            id: photoLuts.id,
            status: photoLuts.status,
            errorCode: photoLuts.errorCode,
            errorMessage: photoLuts.errorMessage,
            completedAt: photoLuts.completedAt,
            expiresAt: photoLuts.expiresAt,
          })
          .from(photoLuts)
          .where(and(eq(photoLuts.id, id), eq(photoLuts.photographerId, photographer.id)))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!lut) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'LUT not found' });
      }

      return ok({
        id: lut.id,
        status: lut.status,
        errorCode: lut.errorCode ?? null,
        errorMessage: lut.errorMessage ?? null,
        completedAt: lut.completedAt ? new Date(lut.completedAt).toISOString() : null,
        expiresAt: new Date(lut.expiresAt).toISOString(),
      });
    })
      .orTee((e) => e.cause && console.error('[studio/luts/status] error:', e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // PATCH /studio/luts/:id
  .patch(
    '/:id',
    requirePhotographer(),
    zValidator('param', lutIdParamSchema),
    zValidator('json', renameSchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;
        const db = c.var.db();
        const { id } = c.req.valid('param');
        const { name } = c.req.valid('json');

        const [updated] = yield* ResultAsync.fromPromise(
          db
            .update(photoLuts)
            .set({ name })
            .where(and(eq(photoLuts.id, id), eq(photoLuts.photographerId, photographer.id)))
            .returning({ id: photoLuts.id, name: photoLuts.name }),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!updated) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'LUT not found' });
        }

        return ok(updated);
      })
        .orTee((e) => e.cause && console.error('[studio/luts/rename] error:', e.cause))
        .match(
          (data) => c.json({ data }),
          (e) => apiError(c, e),
        );
    },
  )

  // GET /studio/luts/:id/download
  .get('/:id/download', requirePhotographer(), zValidator('param', lutIdParamSchema), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');

      const [lut] = yield* ResultAsync.fromPromise(
        db
          .select({
            id: photoLuts.id,
            status: photoLuts.status,
            lutR2Key: photoLuts.lutR2Key,
          })
          .from(photoLuts)
          .where(and(eq(photoLuts.id, id), eq(photoLuts.photographerId, photographer.id)))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!lut) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'LUT not found' });
      }

      if (lut.status !== 'completed' || !lut.lutR2Key) {
        return err<never, HandlerError>({
          code: 'CONFLICT',
          message: 'LUT is not ready for download',
        });
      }

      const presign = yield* ResultAsync.fromPromise(
        generatePresignedGetUrl(
          c.env.CF_ACCOUNT_ID,
          c.env.R2_ACCESS_KEY_ID,
          c.env.R2_SECRET_ACCESS_KEY,
          {
            bucket: c.env.PHOTO_BUCKET_NAME,
            key: lut.lutR2Key,
            expiresIn: PRESIGN_TTL_SECONDS,
          },
        ),
        (cause): HandlerError => ({
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate download URL',
          cause,
        }),
      );

      return ok({
        getUrl: presign.url,
        objectKey: lut.lutR2Key,
        expiresAt: presign.expiresAt.toISOString(),
      });
    })
      .orTee((e) => e.cause && console.error('[studio/luts/download] error:', e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // DELETE /studio/luts/:id
  .delete('/:id', requirePhotographer(), zValidator('param', lutIdParamSchema), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');

      const [lut] = yield* ResultAsync.fromPromise(
        db
          .select({ id: photoLuts.id, lutR2Key: photoLuts.lutR2Key })
          .from(photoLuts)
          .where(and(eq(photoLuts.id, id), eq(photoLuts.photographerId, photographer.id)))
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!lut) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'LUT not found' });
      }

      const [inUse] = yield* ResultAsync.fromPromise(
        db
          .select({ id: activeEvents.id })
          .from(activeEvents)
          .where(
            and(
              eq(activeEvents.photographerId, photographer.id),
              sql`(${activeEvents.settings} -> 'colorGrade' ->> 'lutId') = ${id}`,
            ),
          )
          .limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (inUse) {
        return err<never, HandlerError>({
          code: 'CONFLICT',
          message: 'Cannot delete LUT: it is referenced by an active event',
        });
      }

      if (lut.lutR2Key) {
        yield* ResultAsync.fromPromise(
          c.env.PHOTOS_BUCKET.delete(lut.lutR2Key),
          (cause): HandlerError => ({
            code: 'BAD_GATEWAY',
            message: 'Failed to delete LUT object',
            cause,
          }),
        );
      }

      yield* ResultAsync.fromPromise(
        db
          .delete(photoLuts)
          .where(and(eq(photoLuts.id, id), eq(photoLuts.photographerId, photographer.id))),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({ deleted: true });
    })
      .orTee((e) => e.cause && console.error('[studio/luts/delete] error:', e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  // POST /studio/luts/:id/preview
  .post(
    '/:id/preview',
    requirePhotographer(),
    zValidator('param', lutIdParamSchema),
    zValidator('form', previewFormSchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;

        const { success } = await c.env.LUT_PREVIEW_RATE_LIMITER.limit({
          key: photographer.id,
        });
        if (!success) {
          return err<never, HandlerError>({
            code: 'RATE_LIMITED',
            message: 'Too many preview requests. Please wait a moment and try again.',
            headers: { 'Retry-After': '60' },
          });
        }

        const db = c.var.db();
        const { id } = c.req.valid('param');
        const { file, intensity, includeLuminance } = c.req.valid('form');

        const [lut] = yield* ResultAsync.fromPromise(
          db
            .select({
              id: photoLuts.id,
              status: photoLuts.status,
              lutR2Key: photoLuts.lutR2Key,
            })
            .from(photoLuts)
            .where(and(eq(photoLuts.id, id), eq(photoLuts.photographerId, photographer.id)))
            .limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!lut) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'LUT not found' });
        }

        if (lut.status !== 'completed' || !lut.lutR2Key) {
          return err<never, HandlerError>({
            code: 'CONFLICT',
            message: 'LUT is not ready for preview',
          });
        }

        const r2Object = yield* ResultAsync.fromPromise(
          c.env.PHOTOS_BUCKET.get(lut.lutR2Key),
          (cause): HandlerError => ({
            code: 'BAD_GATEWAY',
            message: 'Failed to fetch LUT from storage',
            cause,
          }),
        );

        if (!r2Object) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'LUT object not found' });
        }

        const lutText = yield* ResultAsync.fromPromise(
          r2Object.text(),
          (cause): HandlerError => ({
            code: 'BAD_GATEWAY',
            message: 'Failed to read LUT from storage',
            cause,
          }),
        );

        const sampleBytes = new Uint8Array(
          yield* ResultAsync.fromPromise(
            file.arrayBuffer(),
            (cause): HandlerError => ({
              code: 'UNPROCESSABLE',
              message: 'Failed to read sample image',
              cause,
            }),
          ),
        );

        const magic = validateImageMagicBytes(sampleBytes.slice(0, 16));
        if (!magic.valid || !magic.detectedType) {
          return err<never, HandlerError>({
            code: 'UNPROCESSABLE',
            message: 'Invalid image format (magic bytes check failed)',
          });
        }

        // Preflight pixel limit before any Worker-side decode.
        // For formats where we can cheaply parse dimensions, do it first.
        const sampleBuffer = sampleBytes.buffer.slice(
          sampleBytes.byteOffset,
          sampleBytes.byteOffset + sampleBytes.byteLength,
        ) as ArrayBuffer;

        const dims =
          magic.detectedType === 'image/jpeg'
            ? extractJpegDimensions(sampleBuffer)
            : magic.detectedType === 'image/png'
              ? extractPngDimensions(sampleBytes)
              : magic.detectedType === 'image/webp'
                ? extractWebpDimensions(sampleBytes)
                : null;

        if (dims && dims.width * dims.height > PREVIEW_MAX_PIXELS) {
          return err<never, HandlerError>({
            code: 'UNPROCESSABLE',
            message: `Image is too large (${dims.width}x${dims.height}). Please upload a smaller sample for preview.`,
          });
        }

        // To avoid Worker OOM on highly-compressible PNG/WebP, transform to a bounded JPEG first.
        const previewJpegBytes =
          magic.detectedType === 'image/jpeg' && dims
            ? sampleBytes
            : new Uint8Array(
                yield* ResultAsync.fromPromise(
                  transformToPreviewJpeg({ images: c.env.IMAGES, bytes: sampleBytes }),
                  (cause): HandlerError => ({
                    code: 'BAD_GATEWAY',
                    message: 'Failed to transform sample image for preview',
                    cause,
                  }),
                ),
              );

        const jpeg = yield* generatePreviewJpegBytes({
          sampleBytes: previewJpegBytes,
          lutText,
          intensity,
          includeLuminance,
        });

        const body = jpeg.buffer.slice(
          jpeg.byteOffset,
          jpeg.byteOffset + jpeg.byteLength,
        ) as ArrayBuffer;
        return ok(
          new Response(body, {
            headers: {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'no-store',
            },
          }),
        );
      })
        .orTee((e) => e.cause && console.error('[studio/luts/preview] error:', e.cause))
        .match(
          (res) => res,
          (e) => apiError(c, e),
        );
    },
  );
