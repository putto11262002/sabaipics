import {
  pgTable,
  text,
  integer,
  index,
  uuid,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamptz, createdAtCol } from "./common";
import { photographers } from "./photographers";

// Enum for credit ledger entry types - Direction (DBSCHEMA-001)
export const creditLedgerTypes = ["credit", "debit"] as const;
export type CreditLedgerType = (typeof creditLedgerTypes)[number];

// Enum for credit ledger sources - Where credits came from
export const creditLedgerSources = [
  "purchase",
  "gift",
  "discount",
  "upload",
  "refund",
  "admin_adjustment",
] as const;
export type CreditLedgerSource = (typeof creditLedgerSources)[number];

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: uuid("photographer_id")
      .notNull()
      .references(() => photographers.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(), // Positive for credit, negative for debit
    type: text("type", { enum: creditLedgerTypes }).notNull(), // Direction: credit or debit
    source: text("source", { enum: creditLedgerSources }).notNull(), // Source: where from
    promoCode: text("promo_code"), // Nullable, promo code used (if any)
    stripeSessionId: text("stripe_session_id"), // Nullable, only for purchases
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: createdAtCol(),
  },
  (table) => [
    index("credit_ledger_photographer_expires_idx").on(
      table.photographerId,
      table.expiresAt
    ),
    index("credit_ledger_stripe_session_idx").on(table.stripeSessionId),
    // Unique constraint for idempotency - prevents duplicate credit grants
    unique("credit_ledger_stripe_session_unique").on(table.stripeSessionId),
  ]
);

export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert;
