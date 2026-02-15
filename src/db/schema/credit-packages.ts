import { pgTable, text, integer, boolean, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAtCol } from "./common";

export const creditPackages = pgTable("credit_packages", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  credits: integer("credits").notNull(),
  priceThb: integer("price_thb").notNull(), // Store in satang (smallest unit) or whole baht
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAtCol(),
});

export type CreditPackage = typeof creditPackages.$inferSelect;
export type NewCreditPackage = typeof creditPackages.$inferInsert;
