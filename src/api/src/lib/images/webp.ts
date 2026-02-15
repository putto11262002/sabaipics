/**
 * Extract WebP width/height without decoding.
 * Supports VP8X, VP8L and VP8 (key frame) containers.
 */

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

function readU24LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)) >>> 0;
}

export function extractWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  if (fourCC(bytes, 0) !== 'RIFF') return null;
  if (fourCC(bytes, 8) !== 'WEBP') return null;

  const chunk = fourCC(bytes, 12);

  // Chunk data starts at offset 20 (12: fourcc, 16: chunk size)
  const dataOffset = 20;

  if (chunk === 'VP8X') {
    // VP8X: flags (1), reserved (3), width-1 (3), height-1 (3)
    if (bytes.length < dataOffset + 10) return null;
    const width = readU24LE(bytes, dataOffset + 4) + 1;
    const height = readU24LE(bytes, dataOffset + 7) + 1;
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  if (chunk === 'VP8L') {
    // VP8L: signature (1 = 0x2f) then 4 bytes with 14-bit width/height
    if (bytes.length < dataOffset + 5) return null;
    if (bytes[dataOffset] !== 0x2f) return null;
    const b1 = bytes[dataOffset + 1]!;
    const b2 = bytes[dataOffset + 2]!;
    const b3 = bytes[dataOffset + 3]!;
    const b4 = bytes[dataOffset + 4]!;

    const widthMinus1 = b1 | ((b2 & 0x3f) << 8);
    const heightMinus1 = (b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10);

    const width = widthMinus1 + 1;
    const height = heightMinus1 + 1;
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  if (chunk === 'VP8 ') {
    // VP8 key frame: frame tag (3), start code (3: 0x9d 0x01 0x2a), then w/h (2 each)
    if (bytes.length < dataOffset + 10) return null;
    const frameTag0 = bytes[dataOffset]!;
    const isKeyFrame = (frameTag0 & 0x01) === 0;
    if (!isKeyFrame) return null;
    if (
      bytes[dataOffset + 3] !== 0x9d ||
      bytes[dataOffset + 4] !== 0x01 ||
      bytes[dataOffset + 5] !== 0x2a
    ) {
      return null;
    }

    const w0 = bytes[dataOffset + 6]!;
    const w1 = bytes[dataOffset + 7]!;
    const h0 = bytes[dataOffset + 8]!;
    const h1 = bytes[dataOffset + 9]!;

    const width = w0 | ((w1 & 0x3f) << 8);
    const height = h0 | ((h1 & 0x3f) << 8);
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  return null;
}
