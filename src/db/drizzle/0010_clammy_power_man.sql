ALTER TABLE "credit_ledger" ADD COLUMN "apple_transaction_id" text;--> statement-breakpoint
CREATE INDEX "credit_ledger_apple_transaction_idx" ON "credit_ledger" USING btree ("apple_transaction_id");--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_apple_transaction_unique" UNIQUE("apple_transaction_id");