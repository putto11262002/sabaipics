import { Result, ok, err } from 'neverthrow';

export type CubeLutDomain = { r: number; g: number; b: number };

export type ParsedCubeLut = {
  size: number;
  table: Float32Array; // RGB triplets in [0..1], length = size^3 * 3
  title?: string;
  domainMin?: CubeLutDomain;
  domainMax?: CubeLutDomain;
};

export type CubeLutParseError = {
  type: 'invalid_format' | 'unsupported';
  message: string;
  line?: number;
};

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function clampByte(x: number): number {
  if (x < 0) return 0;
  if (x > 255) return 255;
  return x;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function parseDomain(tokens: string[], line: number): Result<CubeLutDomain, CubeLutParseError> {
  if (tokens.length !== 4) {
    return err({ type: 'invalid_format', message: 'DOMAIN_* must have 3 values', line });
  }
  const r = Number(tokens[1]);
  const g = Number(tokens[2]);
  const b = Number(tokens[3]);
  if (![r, g, b].every((n) => Number.isFinite(n))) {
    return err({ type: 'invalid_format', message: 'DOMAIN_* contains non-numeric value', line });
  }
  return ok({ r, g, b });
}

function stripInlineComment(line: string): string {
  const hash = line.indexOf('#');
  if (hash === -1) return line;
  return line.slice(0, hash);
}

/**
 * Parses a .cube LUT text file.
 *
 * Assumptions:
 * - 3D LUT only (requires LUT_3D_SIZE)
 * - Entry ordering assumes R changes fastest, then G, then B
 */
export function parseCubeLut(text: string): Result<ParsedCubeLut, CubeLutParseError> {
  const lines = text.split(/\r?\n/);

  let size: number | null = null;
  let title: string | undefined;
  let domainMin: CubeLutDomain | undefined;
  let domainMax: CubeLutDomain | undefined;

  const values: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = stripInlineComment(lines[i] ?? '').trim();
    if (!raw) continue;

    const tokens = raw.split(/\s+/);
    const head = tokens[0];
    if (!head) continue;

    if (head === 'TITLE') {
      // TITLE "My LUT" or TITLE MyLut
      const rest = raw.slice('TITLE'.length).trim();
      const m = rest.match(/^"(.*)"$/);
      title = (m ? m[1] : rest).trim() || undefined;
      continue;
    }

    if (head === 'LUT_3D_SIZE') {
      if (tokens.length !== 2) {
        return err({
          type: 'invalid_format',
          message: 'LUT_3D_SIZE must have 1 value',
          line: lineNo,
        });
      }
      const n = Number(tokens[1]);
      if (!Number.isInteger(n) || n < 2 || n > 128) {
        return err({
          type: 'invalid_format',
          message: 'LUT_3D_SIZE must be an integer between 2 and 128',
          line: lineNo,
        });
      }
      size = n;
      continue;
    }

    if (head === 'LUT_1D_SIZE') {
      return err({ type: 'unsupported', message: '1D LUT is not supported', line: lineNo });
    }

    if (head === 'DOMAIN_MIN') {
      const parsed = parseDomain(tokens, lineNo);
      if (parsed.isErr()) return err(parsed.error);
      domainMin = parsed.value;
      continue;
    }

    if (head === 'DOMAIN_MAX') {
      const parsed = parseDomain(tokens, lineNo);
      if (parsed.isErr()) return err(parsed.error);
      domainMax = parsed.value;
      continue;
    }

    // Data line: 3 floats
    if (tokens.length !== 3) {
      return err({
        type: 'invalid_format',
        message: 'Expected LUT data line with 3 float values',
        line: lineNo,
      });
    }
    const r = Number(tokens[0]);
    const g = Number(tokens[1]);
    const b = Number(tokens[2]);
    if (![r, g, b].every((n) => Number.isFinite(n))) {
      return err({
        type: 'invalid_format',
        message: 'LUT data contains non-numeric value',
        line: lineNo,
      });
    }
    values.push(r, g, b);
  }

  if ((domainMin && !domainMax) || (!domainMin && domainMax)) {
    return err({
      type: 'invalid_format',
      message: 'DOMAIN_MIN and DOMAIN_MAX must both be provided when specifying a domain',
    });
  }
  if (!size) {
    return err({ type: 'invalid_format', message: 'Missing LUT_3D_SIZE' });
  }

  const expectedTriplets = size * size * size;
  if (values.length !== expectedTriplets * 3) {
    return err({
      type: 'invalid_format',
      message: `Expected ${expectedTriplets} LUT entries (got ${values.length / 3})`,
    });
  }

  // Normalize/clamp to [0..1] to avoid unsafe values.
  const table = new Float32Array(values.length);
  for (let j = 0; j < values.length; j++) {
    const v = values[j] ?? 0;
    table[j] = clamp01(v);
  }

  return ok({ size, table, title, domainMin, domainMax });
}

export type ApplyCubeLutOptions = {
  intensity: number; // 0-100
  // If false, attempt to preserve original luma (exclude luminance changes).
  includeLuminance: boolean;
};

function lutIndex(size: number, r: number, g: number, b: number): number {
  return ((b * size + g) * size + r) * 3;
}

function sampleTrilinearInto(
  lut: ParsedCubeLut,
  rT: number,
  gT: number,
  bT: number,
  out: [number, number, number],
): void {
  const size = lut.size;
  const max = size - 1;

  const x = rT * max;
  const y = gT * max;
  const z = bT * max;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = Math.min(x0 + 1, max);
  const y1 = Math.min(y0 + 1, max);
  const z1 = Math.min(z0 + 1, max);

  const tx = x - x0;
  const ty = y - y0;
  const tz = z - z0;

  const t = lut.table;

  const i000 = lutIndex(size, x0, y0, z0);
  const i100 = lutIndex(size, x1, y0, z0);
  const i010 = lutIndex(size, x0, y1, z0);
  const i110 = lutIndex(size, x1, y1, z0);
  const i001 = lutIndex(size, x0, y0, z1);
  const i101 = lutIndex(size, x1, y0, z1);
  const i011 = lutIndex(size, x0, y1, z1);
  const i111 = lutIndex(size, x1, y1, z1);

  const r000 = t[i000] ?? 0;
  const g000 = t[i000 + 1] ?? 0;
  const b000 = t[i000 + 2] ?? 0;

  const r100 = t[i100] ?? 0;
  const g100 = t[i100 + 1] ?? 0;
  const b100 = t[i100 + 2] ?? 0;

  const r010 = t[i010] ?? 0;
  const g010 = t[i010 + 1] ?? 0;
  const b010 = t[i010 + 2] ?? 0;

  const r110 = t[i110] ?? 0;
  const g110 = t[i110 + 1] ?? 0;
  const b110 = t[i110 + 2] ?? 0;

  const r001 = t[i001] ?? 0;
  const g001 = t[i001 + 1] ?? 0;
  const b001 = t[i001 + 2] ?? 0;

  const r101 = t[i101] ?? 0;
  const g101 = t[i101 + 1] ?? 0;
  const b101 = t[i101 + 2] ?? 0;

  const r011 = t[i011] ?? 0;
  const g011 = t[i011 + 1] ?? 0;
  const b011 = t[i011 + 2] ?? 0;

  const r111 = t[i111] ?? 0;
  const g111 = t[i111 + 1] ?? 0;
  const b111 = t[i111 + 2] ?? 0;

  const r00 = lerp(r000, r100, tx);
  const g00 = lerp(g000, g100, tx);
  const b00 = lerp(b000, b100, tx);

  const r10 = lerp(r010, r110, tx);
  const g10 = lerp(g010, g110, tx);
  const b10 = lerp(b010, b110, tx);

  const r01v = lerp(r001, r101, tx);
  const g01v = lerp(g001, g101, tx);
  const b01v = lerp(b001, b101, tx);

  const r11 = lerp(r011, r111, tx);
  const g11 = lerp(g011, g111, tx);
  const b11 = lerp(b011, b111, tx);

  const r0 = lerp(r00, r10, ty);
  const g0 = lerp(g00, g10, ty);
  const b0 = lerp(b00, b10, ty);

  const r1 = lerp(r01v, r11, ty);
  const g1 = lerp(g01v, g11, ty);
  const b1 = lerp(b01v, b11, ty);

  out[0] = clamp01(lerp(r0, r1, tz));
  out[1] = clamp01(lerp(g0, g1, tz));
  out[2] = clamp01(lerp(b0, b1, tz));
}

function normalizeDomain(v: number, min: number, max: number): number {
  if (max === min) return 0;
  return (v - min) / (max - min);
}

function preserveLumaDeltaInPlace(
  inR: number,
  inG: number,
  inB: number,
  outRgb: [number, number, number],
) {
  // Cheap luma preservation in sRGB space.
  const yin = 0.2126 * inR + 0.7152 * inG + 0.0722 * inB;
  const yout = 0.2126 * outRgb[0] + 0.7152 * outRgb[1] + 0.0722 * outRgb[2];
  const d = yin - yout;
  outRgb[0] = clamp01(outRgb[0] + d);
  outRgb[1] = clamp01(outRgb[1] + d);
  outRgb[2] = clamp01(outRgb[2] + d);
}

/**
 * Applies a parsed 3D LUT to an RGBA pixel buffer.
 *
 * - `pixels` is expected to be RGBA (len % 4 === 0)
 * - Output is a new Uint8Array (input is not mutated)
 */
export function applyCubeLutToRgba(
  pixels: Uint8Array,
  lut: ParsedCubeLut,
  options: ApplyCubeLutOptions,
): Uint8Array {
  const intensity = clamp01(options.intensity / 100);
  if (intensity <= 0) {
    return pixels.slice();
  }

  const out = new Uint8Array(pixels.length);
  const dmin = lut.domainMin;
  const dmax = lut.domainMax;

  const tmp: [number, number, number] = [0, 0, 0];

  const len = pixels.length - (pixels.length % 4);
  if (len !== pixels.length) {
    // Preserve trailing bytes if buffer is not RGBA-aligned.
    out.set(pixels.subarray(len), len);
  }

  const inv255 = 1 / 255;
  for (let i = 0; i < len; i += 4) {
    const r = (pixels[i] ?? 0) * inv255;
    const g = (pixels[i + 1] ?? 0) * inv255;
    const b = (pixels[i + 2] ?? 0) * inv255;
    const a = pixels[i + 3] ?? 255;

    const rn = dmin && dmax ? clamp01(normalizeDomain(r, dmin.r, dmax.r)) : r;
    const gn = dmin && dmax ? clamp01(normalizeDomain(g, dmin.g, dmax.g)) : g;
    const bn = dmin && dmax ? clamp01(normalizeDomain(b, dmin.b, dmax.b)) : b;

    sampleTrilinearInto(lut, rn, gn, bn, tmp);
    if (!options.includeLuminance) {
      preserveLumaDeltaInPlace(r, g, b, tmp);
    }

    const rr = lerp(r, tmp[0], intensity);
    const gg = lerp(g, tmp[1], intensity);
    const bb = lerp(b, tmp[2], intensity);

    out[i] = clampByte(Math.round(rr * 255));
    out[i + 1] = clampByte(Math.round(gg * 255));
    out[i + 2] = clampByte(Math.round(bb * 255));
    out[i + 3] = a;
  }

  return out;
}
