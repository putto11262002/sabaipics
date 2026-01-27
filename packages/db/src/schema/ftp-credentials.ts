import { pgTable, text, uuid, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';
import { photographers } from './photographers';
import { events } from './events';

export const ftpCredentials = pgTable(
  'ftp_credentials',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    eventId: uuid('event_id')
      .notNull()
      .unique()
      .references(() => events.id, { onDelete: 'restrict' }),
    photographerId: uuid('photographer_id')
      .notNull()
      .references(() => photographers.id, { onDelete: 'restrict' }),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAtCol(),
  },
  (table) => [
    index('ftp_credentials_event_id_idx').on(table.eventId),
    index('ftp_credentials_photographer_id_idx').on(table.photographerId),
    index('ftp_credentials_username_idx').on(table.username),
  ],
);

export type FtpCredential = typeof ftpCredentials.$inferSelect;
export type NewFtpCredential = typeof ftpCredentials.$inferInsert;
