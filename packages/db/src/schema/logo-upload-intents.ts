import { pgTable, text, integer, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';
import { events } from './events';
import { photographers } from './photographers';

/**
 * Logo Upload Intents
 *
 * Tracks presigned URL uploads for event logos.
 * Separate from photo upload_intents to avoid coupling.
 */

// Status enum for logo upload intent lifecycle
export const logoUploadIntentStatuses = [
  'pending', // presign issued, waiting for upload
  'uploaded', // R2 object exists, processing
  'completed', // logo uploaded and event.logo_r2_key updated
  'failed', // validation failed, object deleted
  'expired', // presign expired, never uploaded
] as const;
export type LogoUploadIntentStatus = (typeof logoUploadIntentStatuses)[number];

export const logoUploadIntents = pgTable(
  'logo_upload_intents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // Who and where
    photographerId: uuid('photographer_id')
      .notNull()
      .references(() => photographers.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),

    // R2 object key (generated at presign time)
    r2Key: text('r2_key').notNull().unique(),

    // Expected file metadata (from presign request)
    contentType: text('content_type').notNull(),
    contentLength: integer('content_length').notNull(),

    // Lifecycle
    status: text('status', { enum: logoUploadIntentStatuses }).notNull().default('pending'),

    // Error tracking (for failed status)
    errorCode: text('error_code'),
    errorMessage: text('error_message'),

    // Timestamps
    createdAt: createdAtCol(),
    expiresAt: timestamptz('expires_at').notNull(), // presign URL expiry
    uploadedAt: timestamptz('uploaded_at'), // when R2 object created
    completedAt: timestamptz('completed_at'), // when event.logo_r2_key updated
  },
  (table) => [
    // Find intent by R2 key (queue worker lookup)
    index('logo_upload_intents_r2_key_idx').on(table.r2Key),
    // Find pending intents for cleanup
    index('logo_upload_intents_status_expires_idx').on(table.status, table.expiresAt),
    // Find by photographer (for debugging/admin)
    index('logo_upload_intents_photographer_idx').on(table.photographerId),
  ],
);

export type LogoUploadIntent = typeof logoUploadIntents.$inferSelect;
export type NewLogoUploadIntent = typeof logoUploadIntents.$inferInsert;
