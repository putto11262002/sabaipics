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
  "apple_purchase",
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
    stripeSessionId: text("stripe_session_id"), // Nullable, only for Stripe purchases
    appleTransactionId: text("apple_transaction_id"), // Nullable, only for Apple IAP purchases
    stripeReceiptUrl: text("stripe_receipt_url"), // Nullable, Stripe receipt URL for purchases
    operationType: text("operation_type"), // Nullable. e.g. 'photo_processing', 'face_search'
    operationId: text("operation_id"), // Nullable. e.g. photo UUID that caused the deduction
    remainingCredits: integer("remaining_credits"), // Nullable. Only on credit (positive) entries. Starts equal to amount, decremented on each allocation
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
    index("credit_ledger_apple_transaction_idx").on(table.appleTransactionId),
    // Unique constraint for idempotency - prevents duplicate Apple IAP credit grants
    unique("credit_ledger_apple_transaction_unique").on(table.appleTransactionId),
  ]
);

export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert;
