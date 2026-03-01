import { z } from 'zod';

export const eventColorGradeSchema = z.object({
  lutId: z.string().uuid().nullable(),
  lutIntensity: z.number().int().min(0).max(100),
  includeLuminance: z.boolean(),
});
