/**
 * Extract PNG width/height without decoding.
 * Reads IHDR (always the first chunk).
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function matches(bytes: Uint8Array, sig: Uint8Array, offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

export function extractPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG signature (8) + length (4) + type (4) + IHDR data (13) at minimum
  if (bytes.length < 24) return null;
  if (!matches(bytes, PNG_SIGNATURE)) return null;

  // First chunk must be IHDR
  const chunkType = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (chunkType !== 'IHDR') return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);

  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  return { width, height };
}
