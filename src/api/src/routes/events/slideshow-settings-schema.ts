import { z } from 'zod';

export const slideshowSettingsSchema = z.object({
  template: z.enum(['carousel', 'spotlight']),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
