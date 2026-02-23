import { pgTable, integer, index, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAtCol } from "./common";
import { creditLedger } from "./credit-ledger";

export const creditAllocations = pgTable(
  "credit_allocations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    debitLedgerEntryId: uuid("debit_ledger_entry_id")
      .notNull()
      .references(() => creditLedger.id, { onDelete: "restrict" }),
    creditLedgerEntryId: uuid("credit_ledger_entry_id")
      .notNull()
      .references(() => creditLedger.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(), // Credits consumed from this credit entry (usually 1)
    createdAt: createdAtCol(),
  },
  (table) => [
    index("credit_allocations_debit_entry_idx").on(table.debitLedgerEntryId),
    index("credit_allocations_credit_entry_idx").on(table.creditLedgerEntryId),
  ]
);

export type CreditAllocation = typeof creditAllocations.$inferSelect;
export type NewCreditAllocation = typeof creditAllocations.$inferInsert;
