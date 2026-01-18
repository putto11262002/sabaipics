import { generatePngQrCode } from "@juit/qrcode";

export type QRSize = "small" | "medium" | "large";

/**
 * QR size presets with dimensions in pixels
 */
export const QR_SIZE_PRESETS: Record<QRSize, number> = {
  small: 256,
  medium: 512,
  large: 1200,
} as const;

/**
 * Calculates the scale (pixels per module) for a given QR size.
 * QR codes have ~25 modules, so scale = targetSize / 25.
 */
function getScaleForSize(size: QRSize): number {
  const targetSize = QR_SIZE_PRESETS[size];
  return Math.ceil(targetSize / 25);
}

/**
 * Generates a QR code PNG for an event access code.
 *
 * The QR encodes the search URL: {baseUrl}/search/{accessCode}
 * (Slideshow is a separate UI feature, not encoded in QR)
 *
 * @param accessCode - 6-character uppercase alphanumeric code (e.g., "ABC123")
 * @param baseUrl - Base URL for the app (from APP_BASE_URL env var)
 * @param size - Size preset: "small" (256px), "medium" (512px), "large" (1200px). Defaults to "medium".
 * @returns PNG image as Uint8Array
 * @throws Error if accessCode format is invalid
 *
 * @example
 * ```typescript
 * // Default medium size
 * const qrPng = await generateEventQR("ABC123", env.APP_BASE_URL);
 *
 * // Specific size
 * const largeQr = await generateEventQR("ABC123", env.APP_BASE_URL, "large");
 * ```
 */
export async function generateEventQR(
  accessCode: string,
  baseUrl: string,
  size: QRSize = "medium"
): Promise<Uint8Array> {
  // Validate access code format (security: prevent injection)
  if (!/^[A-Z0-9]{6}$/.test(accessCode)) {
    throw new Error(
      `Invalid access code format: "${accessCode}". Must be 6 uppercase alphanumeric characters (A-Z0-9).`
    );
  }

  // Construct search URL (decision: single URL, not two URLs)
  const searchUrl = `${baseUrl}/search/${accessCode}`;

  // Generate QR PNG with validated options
  const pngBytes = await generatePngQrCode(searchUrl, {
    ecLevel: "M", // Decision: Medium (15%) error correction
    margin: 4, // Standard quiet zone (4 modules)
    scale: getScaleForSize(size), // Calculate scale based on size preset
  });

  return pngBytes;
}
