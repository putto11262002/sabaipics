import { pgTable, text, integer, index, uuid, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';
import { photographers } from './photographers';

export const photoLutSourceTypes = ['cube', 'reference_image'] as const;
export type PhotoLutSourceType = (typeof photoLutSourceTypes)[number];

export const photoLutStatuses = [
  'pending',
  'processing',
  'completed',
  'failed',
  'expired',
] as const;
export type PhotoLutStatus = (typeof photoLutStatuses)[number];

export type PhotoLutDomain = {
  r: number;
  g: number;
  b: number;
};

export const photoLuts = pgTable(
  'photo_luts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    photographerId: uuid('photographer_id')
      .notNull()
      .references(() => photographers.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),
    sourceType: text('source_type', { enum: photoLutSourceTypes }).notNull(),
    status: text('status', { enum: photoLutStatuses }).notNull().default('pending'),

    // R2 keys
    uploadR2Key: text('upload_r2_key').notNull().unique(), // temp upload under lut-uploads/
    lutR2Key: text('lut_r2_key'), // final .cube under luts/

    // Upload metadata
    contentType: text('content_type').notNull(),
    contentLength: integer('content_length').notNull(),

    // Processing errors
    errorCode: text('error_code'),
    errorMessage: text('error_message'),

    // Optional parsed metadata (best-effort)
    lutSize: integer('lut_size'),
    title: text('title'),
    domainMin: jsonb('domain_min').$type<PhotoLutDomain>(),
    domainMax: jsonb('domain_max').$type<PhotoLutDomain>(),
    sha256: text('sha256'),

    // Timestamps
    createdAt: createdAtCol(),
    expiresAt: timestamptz('expires_at').notNull(),
    completedAt: timestamptz('completed_at'),
  },
  (table) => [
    index('photo_luts_photographer_id_idx').on(table.photographerId),
    index('photo_luts_photographer_created_at_idx').on(table.photographerId, table.createdAt),
    index('photo_luts_status_idx').on(table.status),
    index('photo_luts_status_expires_idx').on(table.status, table.expiresAt),
  ],
);

export type PhotoLut = typeof photoLuts.$inferSelect;
export type NewPhotoLut = typeof photoLuts.$inferInsert;
