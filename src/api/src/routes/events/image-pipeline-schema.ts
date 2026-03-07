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
  .strict()
  .refine(
    (data) => !data.autoEdit || data.autoEditPresetId !== null,
    { message: 'A preset must be selected when auto-edit is enabled', path: ['autoEditPresetId'] },
  );

export type EventImagePipeline = z.infer<typeof eventImagePipelineSchema>;
