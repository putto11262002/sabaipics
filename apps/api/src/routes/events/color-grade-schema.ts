import { z } from 'zod';

export const eventColorGradeSchema = z
  .object({
    enabled: z.boolean(),
    lutId: z.string().uuid().nullable(),
    intensity: z.coerce.number().int().min(0).max(100),
    includeLuminance: z.boolean(),
  })
  .strict()
  .refine((v) => (v.enabled ? v.lutId != null : true), {
    message: 'lutId is required when enabled is true',
    path: ['lutId'],
  });
