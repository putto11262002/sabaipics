import { pgTable, text, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';

export const feedbackCategories = [
  'suggestion',
  'feature_request',
  'general',
] as const;
export type FeedbackCategory = (typeof feedbackCategories)[number];

export const feedbackStatuses = [
  'new',
  'reviewed',
  'planned',
  'completed',
  'dismissed',
] as const;
export type FeedbackStatus = (typeof feedbackStatuses)[number];

export const feedbackSources = ['dashboard', 'event_app', 'ios'] as const;
export type FeedbackSource = (typeof feedbackSources)[number];

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    content: text('content').notNull(),
    category: text('category', { enum: feedbackCategories }).notNull().default('general'),
    status: text('status', { enum: feedbackStatuses }).notNull().default('new'),
    source: text('source', { enum: feedbackSources }).notNull(),
    photographerId: uuid('photographer_id'),
    eventId: uuid('event_id'),
    adminNote: text('admin_note'),
    createdAt: createdAtCol(),
    updatedAt: timestamptz('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => [
    index('feedback_status_idx').on(table.status),
    index('feedback_category_idx').on(table.category),
    index('feedback_photographer_id_idx').on(table.photographerId),
    index('feedback_created_at_idx').on(table.createdAt),
  ],
);

export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
