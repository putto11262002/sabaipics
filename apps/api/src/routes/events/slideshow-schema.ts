/**
 * Validation schemas for slideshow endpoints
 */
import { z } from 'zod';
import type { SlideshowBlock } from '@sabaipics/db';

/**
 * Recursive schema for slideshow blocks (supports nested children)
 */
export const slideshowBlockSchema: z.ZodType<SlideshowBlock> = z.lazy(() =>
  z.object({
    id: z.string().min(1, 'Block ID is required'),
    type: z.string().min(1, 'Block type is required'),
    enabled: z.boolean(),
    props: z.record(z.any()),
    children: z.array(slideshowBlockSchema).optional(),
  }),
);

/**
 * Schema for slideshow configuration
 */
export const slideshowConfigSchema = z.object({
  theme: z.object({
    primary: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be a valid hex color (e.g., #0ea5e9)'),
    background: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Background color must be a valid hex color (e.g., #ffffff)'),
  }),
  blocks: z.array(slideshowBlockSchema),
});

/**
 * Query parameters for slideshow photos feed
 */
export const slideshowPhotosQuerySchema = z.object({
  cursor: z.string().datetime('Invalid cursor format. Must be ISO 8601 datetime.').optional(),
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit must not exceed 50')
    .default(20),
});
