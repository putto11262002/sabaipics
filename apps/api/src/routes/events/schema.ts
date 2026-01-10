import { z } from "zod";

// =============================================================================
// Request Schemas
// =============================================================================

export const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export const eventParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Photo upload validation
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
] as const;

export const uploadPhotoSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, "File cannot be empty")
    .refine(
      (file) => file.size <= MAX_FILE_SIZE,
      `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024} MB`
    )
    .refine(
      (file) => ALLOWED_MIME_TYPES.includes(file.type as any),
      `File type must be one of: ${ALLOWED_MIME_TYPES.join(", ")}`
    ),
});

// =============================================================================
// Types
// =============================================================================

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type UploadPhotoInput = z.infer<typeof uploadPhotoSchema>;
