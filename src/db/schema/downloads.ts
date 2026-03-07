import { pgTable, text, integer, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAtCol } from './common';
import { participantSessions } from './participant-sessions';
import { participantSearches } from './participant-searches';
import { events } from './events';

export const downloadMethods = ['zip', 'share', 'single'] as const;
export type DownloadMethod = (typeof downloadMethods)[number];

export const downloads = pgTable(
  'downloads',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => participantSessions.id, { onDelete: 'cascade' }),
    searchId: uuid('search_id')
      .notNull()
      .references(() => participantSearches.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    photoIds: uuid('photo_ids').array().notNull(),
    method: text('method', { enum: downloadMethods }).notNull(),
    photoCount: integer('photo_count').notNull(),
    createdAt: createdAtCol(),
  },
  (table) => [
    index('downloads_session_id_idx').on(table.sessionId),
    index('downloads_search_id_idx').on(table.searchId),
  ],
);

export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;
