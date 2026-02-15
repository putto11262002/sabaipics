/**
 * Extracts width and height from JPEG file bytes by parsing SOF markers.
 * Supports SOF0, SOF1, and SOF2 (baseline, extended, progressive).
 */
export function extractJpegDimensions(
  bytes: ArrayBuffer,
): { width: number; height: number } | null {
  const view = new DataView(bytes);
  // Verify SOI marker (0xFFD8). Without this, arbitrary bytes can be misread.
  if (view.byteLength < 2 || view.getUint16(0, false) !== 0xffd8) {
    return null;
  }
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
