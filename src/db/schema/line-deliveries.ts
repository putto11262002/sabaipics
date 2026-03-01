import { pgTable, text, integer, boolean, index, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamptz, createdAtCol } from "./common";
import { photographers } from "./photographers";
import { events } from "./events";
import { participantSearches } from "./participant-searches";
import { creditLedger } from "./credit-ledger";

export const lineDeliveryStatuses = [
  "pending",
  "sent",
  "partial",
  "failed",
] as const;
export type LineDeliveryStatus = (typeof lineDeliveryStatuses)[number];

export const lineDeliveries = pgTable(
  "line_deliveries",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: uuid("photographer_id")
      .notNull()
      .references(() => photographers.id, { onDelete: "restrict" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    searchId: uuid("search_id").references(() => participantSearches.id, { onDelete: "set null" }),
    photoIds: uuid("photo_ids").array(),
    lineUserId: text("line_user_id").notNull(),
    messageCount: integer("message_count").notNull().default(0),
    photoCount: integer("photo_count").notNull().default(0),
    creditCharged: boolean("credit_charged").notNull().default(false),
    creditLedgerEntryId: uuid("credit_ledger_entry_id").references(
      () => creditLedger.id,
      { onDelete: "set null" }
    ),
    status: text("status", { enum: lineDeliveryStatuses }).notNull(),
    errorMessage: text("error_message"),
    createdAt: createdAtCol(),
  },
  (table) => [
    index("line_deliveries_photographer_id_idx").on(table.photographerId),
    index("line_deliveries_event_id_idx").on(table.eventId),
    index("line_deliveries_search_id_idx").on(table.searchId),
    index("line_deliveries_photographer_created_idx").on(
      table.photographerId,
      table.createdAt
    ),
  ]
);

export type LineDelivery = typeof lineDeliveries.$inferSelect;
export type NewLineDelivery = typeof lineDeliveries.$inferInsert;
