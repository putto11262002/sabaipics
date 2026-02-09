import { z } from 'zod';
import { PHOTO_MAX_FILE_SIZE, PHOTO_ALLOWED_MIME_TYPES } from '../../lib/upload/constants';

// =============================================================================
// Request Schemas
// =============================================================================

export const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export const updateEventSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subtitle: z.string().max(500).nullable().optional(),
});

export const eventParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const uploadPhotoSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, 'File cannot be empty')
    .refine(
      (file) => file.size <= PHOTO_MAX_FILE_SIZE,
      `File size must be less than ${PHOTO_MAX_FILE_SIZE / 1024 / 1024} MB`,
    )
    .refine(
      (file) => PHOTO_ALLOWED_MIME_TYPES.includes(file.type as any),
      `File type must be one of: ${PHOTO_ALLOWED_MIME_TYPES.join(', ')}`,
    ),
  eventId: z.string().uuid(),
});

// =============================================================================
// Participant Search Schemas
// =============================================================================

const ALLOWED_SEARCH_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const MAX_SELFIE_SIZE = 5 * 1024 * 1024; // 5 MB

export const participantSearchSchema = z.object({
  selfie: z
    .instanceof(File)
    .refine((f) => f.size > 0, 'File cannot be empty')
    .refine(
      (f) => f.size <= MAX_SELFIE_SIZE,
      `File size must be less than 5 MB`,
    )
    .refine(
      (f) => ALLOWED_SEARCH_MIME_TYPES.includes(f.type as (typeof ALLOWED_SEARCH_MIME_TYPES)[number]),
      `File type must be one of: ${ALLOWED_SEARCH_MIME_TYPES.join(', ')}`,
    ),
  consentAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the consent to continue.' }),
  }),
});

export const participantSearchParamsSchema = z.object({
  eventId: z.string().uuid(),
});

// =============================================================================
// Types
// =============================================================================

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type UploadPhotoInput = z.infer<typeof uploadPhotoSchema>;
export type ParticipantSearchInput = z.infer<typeof participantSearchSchema>;
