import { pgTable, text, integer, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz } from './common';
import { events } from './events';
import { participantSessions } from './participant-sessions';
import { selfies } from './selfies';

export const participantSearches = pgTable(
  'participant_searches',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sessionId: uuid('session_id')
      .references(() => participantSessions.id, { onDelete: 'set null' }),
    selfieId: uuid('selfie_id')
      .references(() => selfies.id, { onDelete: 'set null' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    selfieR2Key: text('selfie_r2_key'),
    consentAcceptedAt: timestamptz('consent_accepted_at').notNull(),
    ipAddress: text('ip_address'),
    matchedPhotoIds: uuid('matched_photo_ids').array(),
    matchCount: integer('match_count'),
    searchedAt: timestamptz('searched_at').defaultNow().notNull(),
    deletedAt: timestamptz('deleted_at'),
  },
  (table) => [
    index('participant_searches_event_id_idx').on(table.eventId),
    index('participant_searches_searched_at_idx').on(table.searchedAt),
    index('participant_searches_session_id_idx').on(table.sessionId),
  ],
);

export type ParticipantSearch = typeof participantSearches.$inferSelect;
export type NewParticipantSearch = typeof participantSearches.$inferInsert;
