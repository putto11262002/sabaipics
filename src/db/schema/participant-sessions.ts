import { pgTable, pgView, text, boolean, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';

export const participantSessions = pgTable(
  'participant_sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    token: text('token').notNull().unique(),
    lineUserId: text('line_user_id'),
    isFriend: boolean('is_friend').notNull().default(false),
    consentAcceptedAt: timestamptz('consent_accepted_at'),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAtCol(),
    deletedAt: timestamptz('deleted_at'),
  },
  (table) => [
    index('participant_sessions_token_idx').on(table.token),
    index('participant_sessions_line_user_id_idx').on(table.lineUserId),
    index('participant_sessions_deleted_at_expires_at_idx').on(table.deletedAt, table.expiresAt),
  ],
);

export const activeParticipantSessions = pgView('active_participant_sessions').as((qb) =>
  qb
    .select()
    .from(participantSessions)
    .where(
      sql`${participantSessions.deletedAt} IS NULL AND ${participantSessions.expiresAt} > now()`,
    ),
);

export type ParticipantSession = typeof participantSessions.$inferSelect;
export type NewParticipantSession = typeof participantSessions.$inferInsert;
