import { pgTable, text, integer, boolean, index, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAtCol, timestamptz } from './common';
import { uploadIntents } from './upload-intents';
import { events } from './events';
import { photographers } from './photographers';
import { photos } from './photos';

export const photoJobStatuses = [
  'pending',
  'submitted',
  'completed',
  'failed',
] as const;
export type PhotoJobStatus = (typeof photoJobStatuses)[number];

export const photoJobs = pgTable(
  'photo_jobs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // Back-reference to ingress upload lifecycle
    uploadIntentId: uuid('upload_intent_id')
      .notNull()
      .references(() => uploadIntents.id, { onDelete: 'restrict' }),

    // Photo created during normalization (before recognition)
    photoId: uuid('photo_id').references(() => photos.id),

    // Ownership context (denormalized for fast queries)
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    photographerId: uuid('photographer_id')
      .notNull()
      .references(() => photographers.id, { onDelete: 'restrict' }),

    // Authoritative processing state
    status: text('status', { enum: photoJobStatuses }).notNull().default('pending'),
    attempt: integer('attempt').notNull().default(1),
    maxAttempts: integer('max_attempts').notNull().default(3),

    // Orchestrator correlation
    orchestratorRunId: text('orchestrator_run_id'),

    // Canonical artifact keys
    originalR2Key: text('original_r2_key'),
    processedR2Key: text('processed_r2_key'),

    // Failure/retry context
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    retryable: boolean('retryable'),

    // Credit accounting (pre-debit + compensating refund)
    creditsDebited: integer('credits_debited').notNull().default(0),
    creditsRefunded: integer('credits_refunded').notNull().default(0),

    createdAt: createdAtCol(),
    updatedAt: timestamptz('updated_at').defaultNow().notNull(),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
  },
  (table) => [
    uniqueIndex('photo_jobs_upload_intent_id_uidx').on(table.uploadIntentId),
    index('photo_jobs_status_idx').on(table.status),
    index('photo_jobs_event_status_idx').on(table.eventId, table.status),
    index('photo_jobs_photographer_status_idx').on(table.photographerId, table.status),
    index('photo_jobs_orchestrator_run_id_idx').on(table.orchestratorRunId),
    index('photo_jobs_created_at_idx').on(table.createdAt),
  ],
);

export type PhotoJob = typeof photoJobs.$inferSelect;
export type NewPhotoJob = typeof photoJobs.$inferInsert;

