import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const photographers = pgTable(
  "photographers",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clerkId: text("clerk_id").notNull().unique(),
    email: text("email").notNull(),
    name: text("name"),
    pdpaConsentAt: timestamp("pdpa_consent_at", {
      mode: "string",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("photographers_clerk_id_idx").on(table.clerkId)]
);

export type Photographer = typeof photographers.$inferSelect;
export type NewPhotographer = typeof photographers.$inferInsert;
