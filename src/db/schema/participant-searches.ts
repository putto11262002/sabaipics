import { pgTable, text, integer, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz } from './common';
import { events } from './events';

export const participantSearches = pgTable(
  'participant_searches',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    selfieR2Key: text('selfie_r2_key'),
    consentAcceptedAt: timestamptz('consent_accepted_at').notNull(),
    ipAddress: text('ip_address'),
    matchedPhotoIds: uuid('matched_photo_ids').array(),
    matchCount: integer('match_count'),
    searchedAt: timestamptz('searched_at').defaultNow().notNull(),
  },
  (table) => [
    index('participant_searches_event_id_idx').on(table.eventId),
    index('participant_searches_searched_at_idx').on(table.searchedAt),
  ],
);

export type ParticipantSearch = typeof participantSearches.$inferSelect;
export type NewParticipantSearch = typeof participantSearches.$inferInsert;
