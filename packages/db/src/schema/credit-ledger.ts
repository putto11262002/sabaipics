import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { photographers } from "./photographers";

// Enum for credit ledger entry types (DBSCHEMA-001)
export const creditLedgerTypes = ["purchase", "upload"] as const;
export type CreditLedgerType = (typeof creditLedgerTypes)[number];

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: text("photographer_id")
      .notNull()
      .references(() => photographers.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(), // Positive for purchase, negative for deduction
    type: text("type", { enum: creditLedgerTypes }).notNull(),
    stripeSessionId: text("stripe_session_id"), // Nullable, only for purchases
    expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("credit_ledger_photographer_expires_idx").on(
      table.photographerId,
      table.expiresAt
    ),
    index("credit_ledger_stripe_session_idx").on(table.stripeSessionId),
  ]
);

export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert;
