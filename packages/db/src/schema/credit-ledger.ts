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

// Enum for credit ledger entry types (DBSCHEMA-001)
export const creditLedgerTypes = ["purchase", "upload"] as const;
export type CreditLedgerType = (typeof creditLedgerTypes)[number];

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: uuid("photographer_id")
      .notNull()
      .references(() => photographers.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(), // Positive for purchase, negative for deduction
    type: text("type", { enum: creditLedgerTypes }).notNull(),
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
