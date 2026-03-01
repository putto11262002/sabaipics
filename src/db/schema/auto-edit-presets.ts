import { pgTable, text, uuid, boolean, real, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAtCol } from './common';
import { photographers } from './photographers';

export const autoEditPresets = pgTable(
  'auto_edit_presets',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    photographerId: uuid('photographer_id').references(() => photographers.id, {
      onDelete: 'cascade',
    }),

    name: text('name').notNull(),
    isBuiltin: boolean('is_builtin').notNull().default(false),

    contrast: real('contrast').notNull().default(1.0),
    brightness: real('brightness').notNull().default(1.0),
    saturation: real('saturation').notNull().default(1.0),
    sharpness: real('sharpness').notNull().default(1.0),
    autoContrast: boolean('auto_contrast').notNull().default(false),

    createdAt: createdAtCol(),
  },
  (table) => [
    index('auto_edit_presets_photographer_id_idx').on(table.photographerId),
    index('auto_edit_presets_is_builtin_idx').on(table.isBuiltin),
  ],
);

export type AutoEditPreset = typeof autoEditPresets.$inferSelect;
export type NewAutoEditPreset = typeof autoEditPresets.$inferInsert;

export const BUILTIN_PRESETS: Omit<NewAutoEditPreset, 'id' | 'createdAt'>[] = [
  {
    name: 'Neutral',
    isBuiltin: true,
    contrast: 1.0,
    brightness: 1.0,
    saturation: 1.0,
    sharpness: 1.0,
    autoContrast: false,
    photographerId: null,
  },
  {
    name: 'Warm',
    isBuiltin: true,
    contrast: 1.1,
    brightness: 1.05,
    saturation: 1.15,
    sharpness: 1.1,
    autoContrast: true,
    photographerId: null,
  },
  {
    name: 'Cool',
    isBuiltin: true,
    contrast: 1.1,
    brightness: 1.0,
    saturation: 1.1,
    sharpness: 1.1,
    autoContrast: true,
    photographerId: null,
  },
  {
    name: 'Vibrant',
    isBuiltin: true,
    contrast: 1.2,
    brightness: 1.05,
    saturation: 1.4,
    sharpness: 1.2,
    autoContrast: true,
    photographerId: null,
  },
  {
    name: 'Film',
    isBuiltin: true,
    contrast: 0.95,
    brightness: 1.0,
    saturation: 0.85,
    sharpness: 0.9,
    autoContrast: false,
    photographerId: null,
  },
  {
    name: 'Portrait',
    isBuiltin: true,
    contrast: 1.05,
    brightness: 1.05,
    saturation: 1.1,
    sharpness: 1.3,
    autoContrast: true,
    photographerId: null,
  },
  {
    name: 'High Contrast',
    isBuiltin: true,
    contrast: 1.4,
    brightness: 1.0,
    saturation: 1.1,
    sharpness: 1.2,
    autoContrast: true,
    photographerId: null,
  },
  {
    name: 'Soft',
    isBuiltin: true,
    contrast: 0.9,
    brightness: 1.05,
    saturation: 0.95,
    sharpness: 0.8,
    autoContrast: false,
    photographerId: null,
  },
];
