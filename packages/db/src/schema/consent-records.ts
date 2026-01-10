import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { photographers } from "./photographers";

// Enum for consent types (DBSCHEMA-001)
export const consentTypes = ["pdpa"] as const;
export type ConsentType = (typeof consentTypes)[number];

export const consentRecords = pgTable(
  "consent_records",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: text("photographer_id")
      .notNull()
      .references(() => photographers.id, { onDelete: "restrict" }),
    consentType: text("consent_type", { enum: consentTypes }).notNull(),
    grantedAt: timestamp("granted_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"), // For audit trail
  },
  (table) => [index("consent_records_photographer_id_idx").on(table.photographerId)]
);

export type ConsentRecord = typeof consentRecords.$inferSelect;
export type NewConsentRecord = typeof consentRecords.$inferInsert;
