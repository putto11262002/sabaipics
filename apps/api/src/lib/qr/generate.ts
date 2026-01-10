import { generatePngQrCode } from "@juit/qrcode";

/**
 * Generates a QR code PNG for an event access code.
 *
 * The QR encodes the search URL: {baseUrl}/search/{accessCode}
 * (Slideshow is a separate UI feature, not encoded in QR)
 *
 * @param accessCode - 6-character uppercase alphanumeric code (e.g., "ABC123")
 * @param baseUrl - Base URL for the app (from APP_BASE_URL env var)
 * @returns PNG image as Uint8Array (ready for R2 upload)
 * @throws Error if accessCode format is invalid
 *
 * @example
 * ```typescript
 * const qrPng = await generateEventQR("ABC123", env.APP_BASE_URL);
 * await env.PHOTOS_BUCKET.put(`qr/${eventId}.png`, qrPng);
 * ```
 */
export async function generateEventQR(
  accessCode: string,
  baseUrl: string
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
  });

  return pngBytes;
}
