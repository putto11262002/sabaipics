import { pgTable, text, index, uuid, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';
import { participantSessions } from './participant-sessions';

export const selfies = pgTable(
  'selfies',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => participantSessions.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    embedding: vector('embedding', { dimensions: 512 }),
    createdAt: createdAtCol(),
    deletedAt: timestamptz('deleted_at'),
  },
  (table) => [
    index('selfies_session_id_idx').on(table.sessionId),
  ],
);

export type Selfie = typeof selfies.$inferSelect;
export type NewSelfie = typeof selfies.$inferInsert;
