import { pgTable, text, index, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamptz, createdAtCol } from "./common";

export const photographers = pgTable(
  "photographers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clerkId: text("clerk_id").notNull().unique(),
    email: text("email").notNull(),
    name: text("name"),
    stripeCustomerId: text("stripe_customer_id").unique(),
    pdpaConsentAt: timestamptz("pdpa_consent_at"),
    createdAt: createdAtCol(),
  },
  (table) => [
    index("photographers_clerk_id_idx").on(table.clerkId),
    index("photographers_stripe_customer_id_idx").on(table.stripeCustomerId),
  ]
);

export type Photographer = typeof photographers.$inferSelect;
export type NewPhotographer = typeof photographers.$inferInsert;
