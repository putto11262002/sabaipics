/**
 * Error Utilities
 */

/**
 * Type guard to check if a value is an Error-like object.
 */
export function isError(value: unknown): value is Error {
  return (
    value instanceof Error ||
    (typeof value === "object" &&
      value !== null &&
      "name" in value &&
      "message" in value)
  );
}
