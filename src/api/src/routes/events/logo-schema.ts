/**
 * Validation schemas and constants for logo upload endpoints
 */
import { z } from 'zod';

/**
 * Logo upload constraints
 */
export const LOGO_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const LOGO_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const LOGO_MAX_DIMENSION = 2048; // px (width or height)
export const LOGO_OUTPUT_QUALITY = 95;

/**
 * Schema for logo presign request
 */
export const logoPresignSchema = z.object({
  contentType: z.enum(LOGO_ALLOWED_MIME_TYPES, {
    errorMap: () => ({ message: 'Content type must be image/jpeg, image/png, or image/webp' }),
  }),
  contentLength: z
    .number()
    .int('Content length must be an integer')
    .min(1, 'File cannot be empty')
    .max(LOGO_MAX_FILE_SIZE, `File size must be less than ${LOGO_MAX_FILE_SIZE / 1024 / 1024} MB`),
});

/**
 * Schema for logo status query parameter
 */
export const logoStatusQuerySchema = z.object({
  id: z.string().uuid('Invalid upload ID format'),
});
