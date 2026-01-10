import { customAlphabet } from "nanoid";

/**
 * Access code generation utility.
 *
 * Generates 6-character uppercase alphanumeric codes (A-Z0-9)
 * that are cryptographically random and suitable for QR code encoding.
 *
 * Format: /^[A-Z0-9]{6}$/ (required by generateEventQR from T-14)
 * Alphabet excludes ambiguous characters (I, O, 0, 1) for better readability
 *
 * @example
 * ```typescript
 * import { generateAccessCode } from "~/lib/access-code";
 *
 * const code = generateAccessCode(); // e.g., "A7B2K9"
 * ```
 */

// Uppercase alphabet without ambiguous characters (I, O, 0, 1)
// 32 characters = 32^6 = ~1 billion possible combinations
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

// Generate 6-character codes
const nanoid6 = customAlphabet(ALPHABET, 6);

/**
 * Generates a unique access code for event QR codes.
 *
 * @returns 6-character uppercase alphanumeric string
 */
export function generateAccessCode(): string {
  return nanoid6();
}

/**
 * Validates access code format.
 *
 * Used for double-checking generated codes or validating external input.
 * Matches the regex from T-14's generateEventQR: /^[A-Z0-9]{6}$/
 *
 * @param code - Access code to validate
 * @returns true if valid format
 */
export function isValidAccessCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}
