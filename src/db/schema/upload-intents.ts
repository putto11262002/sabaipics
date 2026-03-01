import { pgTable, text, integer, boolean, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';
import { events } from './events';
import { photographers } from './photographers';

// Status enum for upload intent lifecycle
export const uploadIntentStatuses = [
  'pending', // presign issued, waiting for upload or being processed
  'processing', // claimed by worker and currently in processing pipeline
  'completed', // photo created successfully
  'failed', // validation failed, object deleted
  'expired', // presign expired, never uploaded
] as const;
export type UploadIntentStatus = (typeof uploadIntentStatuses)[number];

export const uploadIntents = pgTable(
  'upload_intents',
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
    contentLength: integer('content_length'),

    // Upload source (for analytics)
    source: text('source', { enum: ['web', 'ftp', 'ios'] }).default('web'),

    // Lifecycle
    status: text('status', { enum: uploadIntentStatuses }).notNull().default('pending'),

    // Error tracking (for failed status)
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    retryable: boolean('retryable'), // true = can be reprocessed after user action (e.g. credit top-up)

    // Result tracking — written before R2 PUT so crons can clean orphaned normalized JPEGs.
    // No FK: photoId is set before the photo record exists (created in a later transaction).
    photoId: uuid('photo_id'),

    // Timestamps
    createdAt: createdAtCol(),
    expiresAt: timestamptz('expires_at').notNull(), // presign URL expiry
    completedAt: timestamptz('completed_at'), // when photo created
    r2CleanedAt: timestamptz('r2_cleaned_at'), // when original R2 object was deleted by cron
  },
  (table) => [
    // Find intent by R2 key (queue worker lookup)
    index('upload_intents_r2_key_idx').on(table.r2Key),
    // Find pending intents for cleanup
    index('upload_intents_status_expires_idx').on(table.status, table.expiresAt),
    // Cleanup cron + reprocessing queries
    index('upload_intents_status_retryable_idx').on(table.status, table.retryable),
    // Find by photographer (for debugging/admin)
    index('upload_intents_photographer_idx').on(table.photographerId),
  ],
);

export type UploadIntent = typeof uploadIntents.$inferSelect;
export type NewUploadIntent = typeof uploadIntents.$inferInsert;
