/**
 * Credit Module Error Types
 *
 * Discriminated union for all credit operation errors.
 * Callers map these to their own error types (HandlerError, UploadProcessingError, etc.)
 */

export type CreditError =
  | { type: 'insufficient_credits'; cause?: undefined }
  | { type: 'database'; cause: unknown };
