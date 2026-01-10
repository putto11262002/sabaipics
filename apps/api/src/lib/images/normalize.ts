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

/**
 * Normalizes an image to JPEG format with specified constraints.
 *
 * Process:
 * 1. Uploads original to temporary R2 location
 * 2. Fetches via CF Images Transform to get normalized JPEG
 * 3. Cleans up temporary file
 * 4. Returns normalized image bytes
 *
 * @param imageBytes - Raw image data (JPEG/PNG/HEIC/WebP)
 * @param originalType - MIME type of original image
 * @param bucket - R2 bucket for temporary storage
 * @param r2BaseUrl - Public base URL for R2 bucket
 * @param options - Normalization parameters
 * @returns Normalized JPEG image bytes
 */
export async function normalizeImage(
  imageBytes: ArrayBuffer,
  originalType: string,
  bucket: R2Bucket,
  r2BaseUrl: string,
  options: NormalizeOptions
): Promise<ArrayBuffer> {
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

    // Step 3: Clean up temporary file
    await bucket.delete(tempKey);

    return normalizedBytes;
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
