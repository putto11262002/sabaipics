/**
 * Image normalization utilities.
 *
 * Two implementations with identical Result shapes:
 * - normalizeWithPhoton: in-Worker Wasm processing (no network dependency)
 * - normalizeWithCfImages: Cloudflare Images API (external service)
 */

import { PhotonImage, SamplingFilter, resize } from '@cf-wasm/photon/workerd';
import { Result, ResultAsync, ok, err } from 'neverthrow';
import { extractJpegDimensions } from './jpeg';

// =============================================================================
// Types
// =============================================================================

export type NormalizeResult = {
  bytes: ArrayBuffer;
  width: number;
  height: number;
};

export type NormalizeError = {
  stage: string;
  cause: unknown;
};

export type PhotonPostProcessHook = (
  pixels: Uint8Array,
  width: number,
  height: number,
) => Uint8Array;

// =============================================================================
// Constants
// =============================================================================

const MAX_WIDTH = 4000;
const JPEG_QUALITY = 90;

// =============================================================================
// Photon (Wasm) Normalizer
// =============================================================================

const safeNewFromBytes = Result.fromThrowable(
  (bytes: Uint8Array) => PhotonImage.new_from_byteslice(bytes),
  (cause): NormalizeError => ({ stage: 'photon_decode', cause }),
);

const safeResize = Result.fromThrowable(
  (img: PhotonImage, w: number, h: number) => resize(img, w, h, SamplingFilter.Lanczos3),
  (cause): NormalizeError => ({ stage: 'photon_resize', cause }),
);

const safeEncodeJpeg = Result.fromThrowable(
  (img: PhotonImage) => {
    const jpegView = img.get_bytes_jpeg(JPEG_QUALITY);
    // Copy bytes out of Wasm memory before freeing — the Uint8Array from
    // get_bytes_jpeg is a view into the Wasm linear memory and becomes
    // invalid once the PhotonImage is freed.
    const bytes = jpegView.slice().buffer as ArrayBuffer;
    return { bytes, width: img.get_width(), height: img.get_height() };
  },
  (cause): NormalizeError => ({ stage: 'photon_encode', cause }),
);

const safeFree = Result.fromThrowable(
  (img: PhotonImage) => img.free(),
  (cause) => cause,
);

export function normalizeWithPhoton(
  imageBytes: ArrayBuffer,
  postProcess?: PhotonPostProcessHook,
): Result<NormalizeResult, NormalizeError> {
  let inputImage: PhotonImage | null = null;
  let resizedImage: PhotonImage | null = null;
  let processedImage: PhotonImage | null = null;

  const cleanup = () => {
    if (processedImage) {
      safeFree(processedImage);
      processedImage = null;
    }
    if (resizedImage) {
      safeFree(resizedImage);
      resizedImage = null;
    }
    if (inputImage) {
      safeFree(inputImage);
      inputImage = null;
    }
  };

  return safeNewFromBytes(new Uint8Array(imageBytes))
    .andThen((img) => {
      inputImage = img;
      const origWidth = img.get_width();

      if (origWidth > MAX_WIDTH) {
        const scale = MAX_WIDTH / origWidth;
        const newHeight = Math.round(img.get_height() * scale);
        return safeResize(img, MAX_WIDTH, newHeight).map((resized) => {
          resizedImage = resized;
          return resized;
        });
      }

      // No resize needed — use input directly for re-encode
      return ok(img);
    })
    .andThen((img) => {
      if (!postProcess) return ok(img);

      const width = img.get_width();
      const height = img.get_height();

      const safePostProcess = Result.fromThrowable(
        () => {
          // Copy pixels out of Wasm memory before any frees.
          const pixels = img.get_raw_pixels().slice();
          const outPixels = postProcess(pixels, width, height);
          const expected = width * height * 4;
          if (outPixels.length !== expected) {
            throw new Error(
              `postProcess returned invalid buffer length (got ${outPixels.length}, expected ${expected})`,
            );
          }
          return new PhotonImage(outPixels, width, height);
        },
        (cause): NormalizeError => ({ stage: 'post_process', cause }),
      );

      return safePostProcess().map((out) => {
        processedImage = out;
        return out;
      });
    })
    .andThen((img) => safeEncodeJpeg(img))
    .map((result) => {
      cleanup();
      return result;
    })
    .mapErr((error) => {
      cleanup();
      return error;
    });
}

// =============================================================================
// CF Images Normalizer
// =============================================================================

const safeExtractDimensions = Result.fromThrowable(
  (bytes: ArrayBuffer) => {
    const dims = extractJpegDimensions(bytes);
    if (!dims) throw new Error('Failed to extract dimensions from normalized JPEG');
    return dims;
  },
  (cause): NormalizeError => ({ stage: 'cf_images_extract_dimensions', cause }),
);

export function normalizeWithCfImages(
  imageBytes: ArrayBuffer,
  images: ImagesBinding,
): ResultAsync<NormalizeResult, NormalizeError> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(imageBytes));
      controller.close();
    },
  });

  return ResultAsync.fromPromise(
    images
      .input(stream)
      .transform({ width: MAX_WIDTH, fit: 'scale-down' })
      .output({ format: 'image/jpeg', quality: JPEG_QUALITY }),
    (cause): NormalizeError => ({ stage: 'cf_images_transform', cause }),
  )
    .andThen((transformResponse) =>
      ResultAsync.fromPromise(
        transformResponse.response().arrayBuffer(),
        (cause): NormalizeError => ({ stage: 'cf_images_read_response', cause }),
      ),
    )
    .andThen((normalizedBytes) =>
      safeExtractDimensions(normalizedBytes).map((dims) => ({
        bytes: normalizedBytes,
        width: dims.width,
        height: dims.height,
      })),
    );
}
