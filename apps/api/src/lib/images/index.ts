/**
 * Image utilities for validation and metadata extraction.
 */

// Re-export JPEG utilities
export { extractJpegDimensions } from './jpeg';

// =============================================================================
// Magic Byte Validation
// =============================================================================

// Magic bytes for image validation
const IMAGE_SIGNATURES = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  gif: [0x47, 0x49, 0x46, 0x38],
  webp: { riff: [0x52, 0x49, 0x46, 0x46], webp: [0x57, 0x45, 0x42, 0x50] },
} as const;

function matchesSignature(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Validates image magic bytes and returns the detected MIME type.
 * Supports JPEG, PNG, GIF, and WebP.
 */
export function validateImageMagicBytes(bytes: Uint8Array): { valid: boolean; detectedType?: string } {
  // JPEG
  if (matchesSignature(bytes, IMAGE_SIGNATURES.jpeg)) {
    return { valid: true, detectedType: 'image/jpeg' };
  }
  // PNG
  if (matchesSignature(bytes, IMAGE_SIGNATURES.png)) {
    return { valid: true, detectedType: 'image/png' };
  }
  // GIF
  if (matchesSignature(bytes, IMAGE_SIGNATURES.gif)) {
    return { valid: true, detectedType: 'image/gif' };
  }
  // WebP (RIFF....WEBP)
  if (
    matchesSignature(bytes, IMAGE_SIGNATURES.webp.riff) &&
    matchesSignature(bytes, IMAGE_SIGNATURES.webp.webp, 8)
  ) {
    return { valid: true, detectedType: 'image/webp' };
  }
  return { valid: false };
}
