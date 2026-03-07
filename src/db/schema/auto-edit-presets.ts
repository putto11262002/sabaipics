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
