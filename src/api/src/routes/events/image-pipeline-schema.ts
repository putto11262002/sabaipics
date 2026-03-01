import { z } from 'zod';

export const eventImagePipelineSchema = z
  .object({
    autoEdit: z.boolean(),
    autoEditPresetId: z.string().uuid().nullable(),
    autoEditIntensity: z.number().int().min(0).max(100),
    lutId: z.string().uuid().nullable(),
    lutIntensity: z.number().int().min(0).max(100),
    includeLuminance: z.boolean(),
  })
  .strict();

export type EventImagePipeline = z.infer<typeof eventImagePipelineSchema>;
