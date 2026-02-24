import { z } from 'zod';

export const eventFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Event name is required')
    .max(200, 'Event name must be 200 characters or less'),
});

export type EventFormData = z.infer<typeof eventFormSchema>;

export const updateEventFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Event name is required')
    .max(200, 'Event name must be 200 characters or less'),
  subtitle: z.string().max(500, 'Subtitle must be 500 characters or less').optional(),
});

export type UpdateEventFormData = z.infer<typeof updateEventFormSchema>;
