import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

export const dbTest = pgTable('_db_test', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type DbTest = typeof dbTest.$inferSelect;
export type NewDbTest = typeof dbTest.$inferInsert;
