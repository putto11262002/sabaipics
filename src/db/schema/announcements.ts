import { pgTable, text, boolean, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';

export const announcementTags = [
  'feature',
  'improvement',
  'fix',
  'maintenance',
] as const;
export type AnnouncementTag = (typeof announcementTags)[number];

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    content: text('content').notNull(),
    tag: text('tag', { enum: announcementTags }),
    publishedAt: timestamptz('published_at'),
    active: boolean('active').notNull().default(false),
    createdBy: text('created_by').notNull(),
    createdAt: createdAtCol(),
    updatedAt: timestamptz('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => [
    index('announcements_active_published_idx').on(
      table.active,
      table.publishedAt,
    ),
  ],
);

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
