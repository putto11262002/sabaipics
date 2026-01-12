/**
 * Image Normalization using Cloudflare Images Transform
 *
 * Normalizes images to JPEG format with specified dimensions and quality.
 * Uses CF Images Transform API via temporary R2 upload.
 */

export interface NormalizeOptions {
  format: "jpeg";
  maxWidth: number;
  maxHeight: number;
  quality: number;
  fit: "scale-down" | "contain" | "cover";
}

export interface NormalizeResult {
  bytes: ArrayBuffer;
  width: number;
  height: number;
}

/**
 * Extracts width and height from JPEG file bytes by parsing SOF markers.
 * Supports SOF0, SOF1, and SOF2 (baseline, extended, progressive).
 */
function extractJpegDimensions(bytes: ArrayBuffer): { width: number; height: number } | null {
  const view = new DataView(bytes);
  let offset = 2; // Skip SOI marker (0xFFD8)

  while (offset < view.byteLength - 8) {
    // Check for marker start
    if (view.getUint8(offset) !== 0xff) {
      offset++;
      continue;
    }

    const marker = view.getUint8(offset + 1);

    // SOF markers: SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      // SOF segment structure: marker (2) + length (2) + precision (1) + height (2) + width (2)
      const height = view.getUint16(offset + 5, false); // big-endian
      const width = view.getUint16(offset + 7, false);
      return { width, height };
    }

    // Skip to next marker
    if (marker === 0xd8 || marker === 0xd9) {
      // SOI or EOI markers have no length
      offset += 2;
    } else if (marker >= 0xd0 && marker <= 0xd7) {
      // RST markers have no length
      offset += 2;
    } else {
      // Read segment length and skip
      const length = view.getUint16(offset + 2, false);
      offset += 2 + length;
    }
  }

  return null;
}

/**
 * Normalizes an image to JPEG format with specified constraints.
 *
 * Process:
 * 1. Uploads original to temporary R2 location
 * 2. Fetches via CF Images Transform to get normalized JPEG
 * 3. Extracts dimensions from normalized JPEG
 * 4. Cleans up temporary file
 * 5. Returns normalized image bytes with dimensions
 *
 * @param imageBytes - Raw image data (JPEG/PNG/HEIC/WebP)
 * @param originalType - MIME type of original image
 * @param bucket - R2 bucket for temporary storage
 * @param r2BaseUrl - Public base URL for R2 bucket
 * @param options - Normalization parameters
 * @returns Normalized JPEG image bytes with width and height
 */
export async function normalizeImage(
  imageBytes: ArrayBuffer,
  originalType: string,
  bucket: R2Bucket,
  r2BaseUrl: string,
  options: NormalizeOptions
): Promise<NormalizeResult> {
  // Generate temporary key for normalization
  const tempKey = `tmp/normalize-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  try {
    // Step 1: Upload to temporary R2 location
    await bucket.put(tempKey, imageBytes, {
      httpMetadata: { contentType: originalType },
    });

    // Step 2: Fetch via CF Images Transform
    const transformUrl = `${r2BaseUrl}/${tempKey}`;
    const transformResponse = await fetch(transformUrl, {
      cf: {
        image: {
          format: options.format,
          quality: options.quality,
          fit: options.fit,
          width: options.maxWidth,
          height: options.maxHeight,
        },
      },
    });

    if (!transformResponse.ok) {
      throw new Error(
        `CF Images Transform failed: ${transformResponse.status} ${transformResponse.statusText}`
      );
    }

    const normalizedBytes = await transformResponse.arrayBuffer();

    // Step 3: Extract dimensions from normalized JPEG
    const dimensions = extractJpegDimensions(normalizedBytes);
    if (!dimensions) {
      throw new Error("Failed to extract dimensions from normalized JPEG");
    }

    // Step 4: Clean up temporary file
    await bucket.delete(tempKey);

    return {
      bytes: normalizedBytes,
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch (error) {
    // Attempt cleanup on error
    try {
      await bucket.delete(tempKey);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Default normalization options matching plan specification.
 *
 * Plan requirements (final.md line 304):
 * - Format: JPEG
 * - Max dimensions: 4000px
 * - Quality: 90%
 * - Fit: scale-down (preserve aspect ratio, don't upscale)
 */
export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  format: "jpeg",
  maxWidth: 4000,
  maxHeight: 4000,
  quality: 90,
  fit: "scale-down",
};
