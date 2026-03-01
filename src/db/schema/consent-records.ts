import { pgTable, text, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAtCol } from './common';
import { photographers } from './photographers';

// Enum for consent types (DBSCHEMA-001)
export const consentTypes = ['pdpa'] as const;
export type ConsentType = (typeof consentTypes)[number];

export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: uuid('photographer_id')
      .notNull()
      .references(() => photographers.id, { onDelete: 'restrict' }),
    consentType: text('consent_type', { enum: consentTypes }).notNull(),
    createdAt: createdAtCol(),
    ipAddress: text('ip_address'), // For audit trail
  },
  (table) => [index('consent_records_photographer_id_idx').on(table.photographerId)],
);

export type ConsentRecord = typeof consentRecords.$inferSelect;
export type NewConsentRecord = typeof consentRecords.$inferInsert;
