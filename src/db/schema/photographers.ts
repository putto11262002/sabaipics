import { pgTable, text, integer, index, uuid, pgView, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';

export interface LineSettings {
  photoCap: 5 | 10 | 15 | 20 | null; // null = send all
  overageEnabled: boolean;
}

export interface PhotographerSettings {
  lineSettings?: LineSettings;
}

export const photographers = pgTable(
  'photographers',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clerkId: text('clerk_id').notNull().unique(),
    email: text('email').notNull(),
    name: text('name'),
    stripeCustomerId: text('stripe_customer_id').unique(),
    pdpaConsentAt: timestamptz('pdpa_consent_at'),
    balance: integer('balance').notNull().default(0), // Denormalized running balance
    settings: jsonb('settings').$type<PhotographerSettings>(),
    bannedAt: timestamptz('banned_at'), // null = not banned, set = account suspended
    deletedAt: timestamptz('deleted_at'), // null = active, set = soft deleted
    createdAt: createdAtCol(),
  },
  (table) => [
    index('photographers_clerk_id_idx').on(table.clerkId),
    index('photographers_stripe_customer_id_idx').on(table.stripeCustomerId),
    index('photographers_banned_at_idx').on(table.bannedAt),
    index('photographers_deleted_at_idx').on(table.deletedAt),
  ],
);

export type Photographer = typeof photographers.$inferSelect;
export type NewPhotographer = typeof photographers.$inferInsert;

/**
 * Active Photographers View
 *
 * Filters out soft-deleted photographers (where deleted_at IS NOT NULL).
 * Use this view for all application queries to automatically exclude deleted photographers.
 * Query the base `photographers` table directly only for admin/debugging purposes.
 */
export const activePhotographers = pgView('active_photographers').as((qb) =>
  qb
    .select()
    .from(photographers)
    .where(sql`${photographers.deletedAt} IS NULL`),
);

export type ActivePhotographer = typeof activePhotographers.$inferSelect;
