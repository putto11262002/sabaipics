/**
 * Convert a hex color string to an oklch() CSS value.
 * Uses the browser's built-in color parsing via a canvas context.
 *
 * Fallback: if we can't parse, return the hex as-is (browsers handle it).
 */

/** Convert hex (#rrggbb) to sRGB [0-1] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

/** sRGB to linear RGB */
function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear RGB to CIEXYZ (D65) */
function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  return [x, y, z];
}

/** CIEXYZ to OKLab */
function xyzToOklab(x: number, y: number, z: number): [number, number, number] {
  const l_ = 0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z;
  const m_ = 0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z;
  const s_ = 0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z;

  const l1 = Math.cbrt(l_);
  const m1 = Math.cbrt(m_);
  const s1 = Math.cbrt(s_);

  const L = 0.2104542553 * l1 + 0.793617785 * m1 - 0.0040720468 * s1;
  const a = 1.9779984951 * l1 - 2.428592205 * m1 + 0.4505937099 * s1;
  const b = 0.0259040371 * l1 + 0.7827717662 * m1 - 0.808675766 * s1;

  return [L, a, b];
}

/** OKLab to OKLCH */
function oklabToOklch(L: number, a: number, b: number): [number, number, number] {
  const C = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

/**
 * Convert hex color to oklch CSS value string.
 * Returns e.g. "oklch(0.623 0.214 259.815)"
 */
export function hexToOklch(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [lr, lg, lb] = [linearize(r), linearize(g), linearize(b)];
  const [x, y, z] = linearRgbToXyz(lr, lg, lb);
  const [L, a, ob] = xyzToOklab(x, y, z);
  const [ol, oc, oh] = oklabToOklch(L, a, ob);

  // Round to 3 decimal places
  const lStr = ol.toFixed(3);
  const cStr = oc.toFixed(3);
  const hStr = oh.toFixed(3);

  return `oklch(${lStr} ${cStr} ${hStr})`;
}

/**
 * Compute a foreground color (light or dark) that contrasts
 * well against the given hex background.
 * Returns an oklch string.
 */
export function contrastForeground(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  // Relative luminance (simplified)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Return white or dark foreground
  return luminance > 0.5 ? 'oklch(0.205 0 0)' : 'oklch(0.985 0 0)';
}

/**
 * Parse a hex color into its oklch components [L, C, H].
 */
function hexToOklchComponents(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const [lr, lg, lb] = [linearize(r), linearize(g), linearize(b)];
  const [x, y, z] = linearRgbToXyz(lr, lg, lb);
  const [L, a, ob] = xyzToOklab(x, y, z);
  return oklabToOklch(L, a, ob);
}

/**
 * Create a neutral (achromatic) oklch string at the given lightness.
 * Chroma is 0 so hue is irrelevant.
 */
function neutral(L: number): string {
  return `oklch(${clamp(L, 0, 1).toFixed(3)} 0 0)`;
}

/** Clamp a number between min and max. */
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Get the relative luminance of a hex color (sRGB, simplified).
 * Used to determine if a background is light or dark.
 */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Build the FULL set of CSS variable overrides for a canvas wrapper div.
 * Scoping these on a div means all shadcn/ui components inside
 * will pick up the themed colors automatically.
 *
 * Derivation mirrors shadcn's globals.css logic:
 * - primary/primary-foreground come from the user-chosen accent color
 * - all other vars are derived from the background lightness
 * - light mode: muted/secondary/accent are slightly darker than bg
 * - dark mode: muted/secondary/accent are slightly lighter than bg
 */
export function buildThemeCssVars(primary: string, background: string): Record<string, string> {
  const [bgL] = hexToOklchComponents(background);
  const isLight = relativeLuminance(background) > 0.5;

  // Direction multiplier: light mode darkens (subtract), dark mode lightens (add)
  const dir = isLight ? -1 : 1;

  // --- Background-derived lightness values ---
  const fgL = isLight ? 0.145 : 0.985;
  const mutedL = clamp(bgL + dir * 0.03, 0, 1);
  const mutedFgL = isLight ? 0.556 : 0.556; // mid-gray works for both
  const borderL = clamp(mutedL + dir * 0.05, 0, 1);
  const ringL = (mutedFgL + borderL) / 2; // between muted-fg and border

  // --- Primary color (keeps its chroma/hue) ---
  const primaryOklch = hexToOklch(primary);
  const primaryFg = contrastForeground(primary);

  return {
    // Background & foreground (preserve actual color, not just lightness)
    '--background': hexToOklch(background),
    '--foreground': neutral(fgL),

    // Card (same as background)
    '--card': hexToOklch(background),
    '--card-foreground': neutral(fgL),

    // Popover (same as background)
    '--popover': hexToOklch(background),
    '--popover-foreground': neutral(fgL),

    // Primary (user-chosen accent — keeps chroma)
    '--primary': primaryOklch,
    '--primary-foreground': primaryFg,

    // Secondary (slightly offset from background, neutral)
    '--secondary': neutral(mutedL),
    '--secondary-foreground': neutral(fgL),

    // Muted
    '--muted': neutral(mutedL),
    '--muted-foreground': neutral(mutedFgL),

    // Accent (same as muted)
    '--accent': neutral(mutedL),
    '--accent-foreground': neutral(fgL),

    // Destructive (fixed red, independent of theme)
    '--destructive': 'oklch(0.580 0.220 27.000)',

    // Border & input
    '--border': neutral(borderL),
    '--input': neutral(borderL),

    // Ring
    '--ring': neutral(ringL),
  };
}
