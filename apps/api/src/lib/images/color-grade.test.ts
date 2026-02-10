import { describe, it, expect } from 'vitest';
import { parseCubeLut, applyCubeLutToRgba } from './color-grade';

describe('color-grade: .cube parse + apply', () => {
  it('parses a minimal 2x2x2 LUT', () => {
    const cube = [
      'TITLE "Identity"',
      'LUT_3D_SIZE 2',
      // R fastest, then G, then B
      '0 0 0',
      '1 0 0',
      '0 1 0',
      '1 1 0',
      '0 0 1',
      '1 0 1',
      '0 1 1',
      '1 1 1',
      '',
    ].join('\n');

    const parsed = parseCubeLut(cube);
    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr()) return;

    expect(parsed.value.size).toBe(2);
    expect(parsed.value.table.length).toBe(2 * 2 * 2 * 3);
  });

  it('applies identity LUT as no-op', () => {
    const cube = [
      'LUT_3D_SIZE 2',
      '0 0 0',
      '1 0 0',
      '0 1 0',
      '1 1 0',
      '0 0 1',
      '1 0 1',
      '0 1 1',
      '1 1 1',
      '',
    ].join('\n');
    const lut = parseCubeLut(cube);
    expect(lut.isOk()).toBe(true);
    if (lut.isErr()) return;

    const pixels = new Uint8Array([
      0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 128, 64, 32, 255,
    ]);

    const out = applyCubeLutToRgba(pixels, lut.value, { intensity: 100, includeLuminance: false });
    expect(Array.from(out)).toEqual(Array.from(pixels));
  });

  it('intensity=0 returns original pixels', () => {
    const cube = [
      'LUT_3D_SIZE 2',
      // All black LUT
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '',
    ].join('\n');
    const lut = parseCubeLut(cube);
    expect(lut.isOk()).toBe(true);
    if (lut.isErr()) return;

    const pixels = new Uint8Array([100, 150, 200, 255]);
    const out = applyCubeLutToRgba(pixels, lut.value, { intensity: 0, includeLuminance: false });
    expect(Array.from(out)).toEqual(Array.from(pixels));
  });

  it('includeLuminance=false nudges output toward original luma', () => {
    const cube = [
      'LUT_3D_SIZE 2',
      // All black LUT
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '',
    ].join('\n');
    const lut = parseCubeLut(cube);
    expect(lut.isOk()).toBe(true);
    if (lut.isErr()) return;

    const pixels = new Uint8Array([128, 128, 128, 255]);
    const out = applyCubeLutToRgba(pixels, lut.value, { intensity: 100, includeLuminance: false });

    // Should not remain black, since we preserve luma by shifting channels.
    expect(out[0]).toBeGreaterThan(80);
    expect(out[1]).toBeGreaterThan(80);
    expect(out[2]).toBeGreaterThan(80);
  });

  it('includeLuminance=true allows LUT to change luma', () => {
    const cube = [
      'LUT_3D_SIZE 2',
      // All black LUT
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '0 0 0',
      '',
    ].join('\n');
    const lut = parseCubeLut(cube);
    expect(lut.isOk()).toBe(true);
    if (lut.isErr()) return;

    const pixels = new Uint8Array([128, 128, 128, 255]);
    const out = applyCubeLutToRgba(pixels, lut.value, { intensity: 100, includeLuminance: true });
    expect(Array.from(out)).toEqual([0, 0, 0, 255]);
  });

  it('rejects LUT without LUT_3D_SIZE', () => {
    const parsed = parseCubeLut('0 0 0\n');
    expect(parsed.isErr()).toBe(true);
  });

  it('rejects 1D LUT', () => {
    const parsed = parseCubeLut('LUT_1D_SIZE 16\n');
    expect(parsed.isErr()).toBe(true);
  });

  it('supports inline comments and DOMAIN_MIN/MAX remapping', () => {
    const cube = [
      '# comment',
      'TITLE "Domain Test" # inline comment',
      'DOMAIN_MIN 0.25 0.25 0.25',
      'DOMAIN_MAX 0.75 0.75 0.75',
      'LUT_3D_SIZE 2',
      // identity LUT (R fastest)
      '0 0 0',
      '1 0 0',
      '0 1 0',
      '1 1 0',
      '0 0 1',
      '1 0 1',
      '0 1 1',
      '1 1 1',
      '',
    ].join('\n');

    const lut = parseCubeLut(cube);
    expect(lut.isOk()).toBe(true);
    if (lut.isErr()) return;

    // Input at DOMAIN_MIN should map to 0 (black) for identity LUT.
    const px = new Uint8Array([64, 64, 64, 255]);
    const out = applyCubeLutToRgba(px, lut.value, { intensity: 100, includeLuminance: true });
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
  });
});
