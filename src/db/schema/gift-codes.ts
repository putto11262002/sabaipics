import { pgTable, text, integer, boolean, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';
import { photographers } from './photographers';
import { creditLedger } from './credit-ledger';

export const giftCodes = pgTable(
  'gift_codes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: text('code').notNull().unique(),
    credits: integer('credits').notNull(),
    description: text('description'),
    expiresAt: timestamptz('expires_at'),
    creditExpiresInDays: integer('credit_expires_in_days').notNull().default(180),
    maxRedemptions: integer('max_redemptions'),
    maxRedemptionsPerUser: integer('max_redemptions_per_user').notNull().default(1),
    targetPhotographerIds: uuid('target_photographer_ids').array(),
    active: boolean('active').notNull().default(true),
    createdBy: text('created_by').notNull(),
    createdAt: createdAtCol(),
  },
  (table) => [index('gift_codes_active_idx').on(table.active)],
);

export type GiftCode = typeof giftCodes.$inferSelect;
export type NewGiftCode = typeof giftCodes.$inferInsert;

export const giftCodeRedemptions = pgTable(
  'gift_code_redemptions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    giftCodeId: uuid('gift_code_id')
      .notNull()
      .references(() => giftCodes.id, { onDelete: 'restrict' }),
    photographerId: uuid('photographer_id')
      .notNull()
      .references(() => photographers.id, { onDelete: 'restrict' }),
    creditsGranted: integer('credits_granted').notNull(),
    creditLedgerEntryId: uuid('credit_ledger_entry_id')
      .notNull()
      .references(() => creditLedger.id, { onDelete: 'restrict' }),
    redeemedAt: createdAtCol(),
  },
  (table) => [
    index('gift_code_redemptions_code_photographer_idx').on(table.giftCodeId, table.photographerId),
    index('gift_code_redemptions_code_idx').on(table.giftCodeId),
  ],
);

export type GiftCodeRedemption = typeof giftCodeRedemptions.$inferSelect;
export type NewGiftCodeRedemption = typeof giftCodeRedemptions.$inferInsert;
