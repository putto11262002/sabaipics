import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq, or } from 'drizzle-orm';
import { autoEditPresets } from '@/db';
import { ResultAsync, safeTry, ok, err, Result } from 'neverthrow';
import { PhotonImage } from '@cf-wasm/photon/workerd';

import { requirePhotographer } from '../../middleware';
import type { Env } from '../../types';
import { apiError, type HandlerError } from '../../lib/error';
import {
  extractJpegDimensions,
  extractPngDimensions,
  extractWebpDimensions,
  validateImageMagicBytes,
} from '../../lib/images';

const PREVIEW_MAX_WIDTH = 1200;
const PREVIEW_MAX_HEIGHT = 1200;
const PREVIEW_JPEG_QUALITY = 85;
const PREVIEW_MAX_PIXELS = 20_000_000;

const ALLOWED_PREVIEW_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const presetIdParamSchema = z.object({
  id: z.string().uuid('Invalid preset ID'),
});

const listPresetsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(200),
});

const createPresetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contrast: z.coerce.number().min(0.5).max(2.0).default(1.0),
  brightness: z.coerce.number().min(0.5).max(2.0).default(1.0),
  saturation: z.coerce.number().min(0.5).max(2.0).default(1.0),
  sharpness: z.coerce.number().min(0.5).max(2.0).default(1.0),
  autoContrast: z.coerce.boolean().default(false),
});

const updatePresetSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  contrast: z.coerce.number().min(0.5).max(2.0).optional(),
  brightness: z.coerce.number().min(0.5).max(2.0).optional(),
  saturation: z.coerce.number().min(0.5).max(2.0).optional(),
  sharpness: z.coerce.number().min(0.5).max(2.0).optional(),
  autoContrast: z.coerce.boolean().optional(),
});

const previewFormSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0, 'File cannot be empty')
    .refine((f) => f.size <= 15 * 1024 * 1024, 'File too large')
    .refine(
      (f) =>
        ALLOWED_PREVIEW_MIME_TYPES.includes(f.type as (typeof ALLOWED_PREVIEW_MIME_TYPES)[number]),
      `File type must be one of: ${ALLOWED_PREVIEW_MIME_TYPES.join(', ')}`,
    ),
  intensity: z.coerce.number().int().min(0).max(100).default(100),
});

const safePhotonDecode = Result.fromThrowable(
  (bytes: Uint8Array) => PhotonImage.new_from_byteslice(bytes),
  (cause): HandlerError => ({ code: 'UNPROCESSABLE', message: 'Failed to decode image', cause }),
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

function applyAutoEditToRgba(
  pixels: Uint8Array,
  width: number,
  height: number,
  params: {
    contrast: number;
    brightness: number;
    saturation: number;
    sharpness: number;
    autoContrast: boolean;
  },
): Uint8Array {
  const out = new Uint8Array(pixels.length);
  const { contrast, brightness, saturation, sharpness, autoContrast } = params;

  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i]! / 255;
    let g = pixels[i + 1]! / 255;
    let b = pixels[i + 2]! / 255;
    const a = pixels[i + 3]!;

    if (autoContrast) {
      r = Math.min(1, Math.max(0, (r - 0.5) * contrast + 0.5));
      g = Math.min(1, Math.max(0, (g - 0.5) * contrast + 0.5));
      b = Math.min(1, Math.max(0, (b - 0.5) * contrast + 0.5));
    }

    r = Math.min(1, Math.max(0, r * brightness));
    g = Math.min(1, Math.max(0, g * brightness));
    b = Math.min(1, Math.max(0, b * brightness));

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = Math.min(1, Math.max(0, gray + (r - gray) * saturation));
    g = Math.min(1, Math.max(0, gray + (g - gray) * saturation));
    b = Math.min(1, Math.max(0, gray + (b - gray) * saturation));

    out[i] = Math.round(r * 255);
    out[i + 1] = Math.round(g * 255);
    out[i + 2] = Math.round(b * 255);
    out[i + 3] = a;
  }

  if (sharpness !== 1.0) {
    const sharpened = sharpenRgba(out, width, height, sharpness);
    for (let i = 0; i < pixels.length; i++) {
      out[i] = sharpened[i]!;
    }
  }

  return out;
}

function sharpenRgba(
  pixels: Uint8Array,
  width: number,
  height: number,
  amount: number,
): Uint8Array {
  const out = new Uint8Array(pixels.length);

  const kernel = [0, -amount, 0, -amount, 1 + 4 * amount, -amount, 0, -amount, 0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        out[idx] = pixels[idx]!;
        out[idx + 1] = pixels[idx + 1]!;
        out[idx + 2] = pixels[idx + 2]!;
        out[idx + 3] = pixels[idx + 3]!;
        continue;
      }

      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const kidx = ((y + ky) * width + (x + kx)) * 4 + c;
            const k = kernel[(ky + 1) * 3 + (kx + 1)]!;
            sum += pixels[kidx]! * k;
          }
        }
        out[idx + c] = Math.min(255, Math.max(0, Math.round(sum)));
      }
      out[idx + 3] = pixels[idx + 3]!;
    }
  }

  return out;
}

function generatePreviewJpegBytes(params: {
  sampleBytes: Uint8Array;
  preset: typeof autoEditPresets.$inferSelect;
  intensity: number;
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

  const sampleBuffer = params.sampleBytes.buffer.slice(
    params.sampleBytes.byteOffset,
    params.sampleBytes.byteOffset + params.sampleBytes.byteLength,
  ) as ArrayBuffer;

  const dims = extractJpegDimensions(sampleBuffer);
  if (dims && dims.width * dims.height > PREVIEW_MAX_PIXELS) {
    return err({
      code: 'UNPROCESSABLE',
      message: `Image is too large (${dims.width}x${dims.height}). Please upload a smaller sample.`,
    });
  }

  let input: PhotonImage | null = null;
  let outImg: PhotonImage | null = null;

  const cleanup = () => {
    try {
      outImg?.free();
    } catch {}
    try {
      input?.free();
    } catch {}
    outImg = null;
    input = null;
  };

  try {
    const decoded = safePhotonDecode(params.sampleBytes);
    if (decoded.isErr()) {
      cleanup();
      return err(decoded.error);
    }
    input = decoded.value;

    const width = input.get_width();
    const height = input.get_height();
    const pixels = input.get_raw_pixels().slice();

    const editedPixels = applyAutoEditToRgba(pixels, width, height, {
      contrast: params.preset.contrast,
      brightness: params.preset.brightness,
      saturation: params.preset.saturation,
      sharpness: params.preset.sharpness,
      autoContrast: params.preset.autoContrast,
    });

    let finalPixels = editedPixels;
    if (params.intensity < 100) {
      const blendFactor = params.intensity / 100;
      finalPixels = new Uint8Array(editedPixels.length);
      for (let i = 0; i < pixels.length; i++) {
        finalPixels[i] = Math.round(
          pixels[i]! * (1 - blendFactor) + editedPixels[i]! * blendFactor,
        );
      }
    }

    outImg = new PhotonImage(finalPixels, width, height);
    const jpeg = safeEncodeJpegBytes(outImg);
    if (jpeg.isErr()) {
      cleanup();
      return err(jpeg.error);
    }

    const result = ok(jpeg.value);
    cleanup();
    return result;
  } catch (cause) {
    cleanup();
    return err({
      code: 'INTERNAL_ERROR',
      message: 'Failed to generate preview',
      cause,
    });
  }
}

export const studioAutoEditRouter = new Hono<Env>()
  .get('/', requirePhotographer(), zValidator('query', listPresetsQuerySchema), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { limit } = c.req.valid('query');

      const rows = yield* ResultAsync.fromPromise(
        db
          .select()
          .from(autoEditPresets)
          .where(
            or(
              eq(autoEditPresets.photographerId, photographer.id),
              eq(autoEditPresets.isBuiltin, true),
            ),
          )
          .orderBy(desc(autoEditPresets.isBuiltin), desc(autoEditPresets.createdAt))
          .limit(limit),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          isBuiltin: r.isBuiltin,
          contrast: r.contrast,
          brightness: r.brightness,
          saturation: r.saturation,
          sharpness: r.sharpness,
          autoContrast: r.autoContrast,
          createdAt: new Date(r.createdAt).toISOString(),
        })),
      );
    })
      .orTee((e) => e.cause && console.error('[studio/auto-edit] error:', e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  .post('/', requirePhotographer(), zValidator('json', createPresetSchema), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { name, contrast, brightness, saturation, sharpness, autoContrast } =
        c.req.valid('json');

      const [preset] = yield* ResultAsync.fromPromise(
        db
          .insert(autoEditPresets)
          .values({
            photographerId: photographer.id,
            name,
            contrast,
            brightness,
            saturation,
            sharpness,
            autoContrast,
            isBuiltin: false,
          })
          .returning(),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({
        id: preset.id,
        name: preset.name,
        isBuiltin: preset.isBuiltin,
        contrast: preset.contrast,
        brightness: preset.brightness,
        saturation: preset.saturation,
        sharpness: preset.sharpness,
        autoContrast: preset.autoContrast,
        createdAt: new Date(preset.createdAt).toISOString(),
      });
    })
      .orTee((e) => e.cause && console.error('[studio/auto-edit/create] error:', e.cause))
      .match(
        (data) => c.json({ data }, 201),
        (e) => apiError(c, e),
      );
  })

  .patch(
    '/:id',
    requirePhotographer(),
    zValidator('param', presetIdParamSchema),
    zValidator('json', updatePresetSchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;
        const db = c.var.db();
        const { id } = c.req.valid('param');
        const updates = c.req.valid('json');

        const [existing] = yield* ResultAsync.fromPromise(
          db.select().from(autoEditPresets).where(eq(autoEditPresets.id, id)).limit(1),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        if (!existing) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Preset not found' });
        }

        if (existing.isBuiltin) {
          return err<never, HandlerError>({
            code: 'FORBIDDEN',
            message: 'Cannot modify built-in presets',
          });
        }

        if (existing.photographerId !== photographer.id) {
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Preset not found' });
        }

        const [updated] = yield* ResultAsync.fromPromise(
          db.update(autoEditPresets).set(updates).where(eq(autoEditPresets.id, id)).returning(),
          (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
        );

        return ok({
          id: updated.id,
          name: updated.name,
          isBuiltin: updated.isBuiltin,
          contrast: updated.contrast,
          brightness: updated.brightness,
          saturation: updated.saturation,
          sharpness: updated.sharpness,
          autoContrast: updated.autoContrast,
          createdAt: new Date(updated.createdAt).toISOString(),
        });
      })
        .orTee((e) => e.cause && console.error('[studio/auto-edit/update] error:', e.cause))
        .match(
          (data) => c.json({ data }),
          (e) => apiError(c, e),
        );
    },
  )

  .delete('/:id', requirePhotographer(), zValidator('param', presetIdParamSchema), async (c) => {
    return safeTry(async function* () {
      const photographer = c.var.photographer;
      const db = c.var.db();
      const { id } = c.req.valid('param');

      const [existing] = yield* ResultAsync.fromPromise(
        db.select().from(autoEditPresets).where(eq(autoEditPresets.id, id)).limit(1),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      if (!existing) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Preset not found' });
      }

      if (existing.isBuiltin) {
        return err<never, HandlerError>({
          code: 'FORBIDDEN',
          message: 'Cannot delete built-in presets',
        });
      }

      if (existing.photographerId !== photographer.id) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Preset not found' });
      }

      yield* ResultAsync.fromPromise(
        db.delete(autoEditPresets).where(eq(autoEditPresets.id, id)),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
      );

      return ok({ deleted: true });
    })
      .orTee((e) => e.cause && console.error('[studio/auto-edit/delete] error:', e.cause))
      .match(
        (data) => c.json({ data }),
        (e) => apiError(c, e),
      );
  })

  .post(
    '/:id/preview',
    requirePhotographer(),
    zValidator('param', presetIdParamSchema),
    zValidator('form', previewFormSchema),
    async (c) => {
      return safeTry(async function* () {
        const photographer = c.var.photographer;
        const db = c.var.db();
        const { id } = c.req.valid('param');
        const { file, intensity } = c.req.valid('form');

        const [preset] = yield* ResultAsync.fromPromise(
          db
            .select()
            .from(autoEditPresets)
            .where(
              and(
                eq(autoEditPresets.id, id),
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
          return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Preset not found' });
        }

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
            message: `Image is too large (${dims.width}x${dims.height}). Please upload a smaller sample.`,
          });
        }

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

        const jpegResult = await generatePreviewJpegBytes({
          sampleBytes: previewJpegBytes,
          preset,
          intensity,
        });
        if (jpegResult.isErr()) {
          return err<never, HandlerError>(jpegResult.error);
        }
        const jpeg = jpegResult.value;

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
        .orTee((e) => e.cause && console.error('[studio/auto-edit/preview] error:', e.cause))
        .match(
          (res) => res,
          (e) => apiError(c, e),
        );
    },
  );
