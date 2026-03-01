CREATE TABLE "credit_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debit_ledger_entry_id" uuid NOT NULL,
	"credit_ledger_entry_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP VIEW "public"."active_photographers";--> statement-breakpoint
ALTER TABLE "photographers" ADD COLUMN "balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "operation_type" text;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "operation_id" text;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "remaining_credits" integer;--> statement-breakpoint
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_debit_ledger_entry_id_credit_ledger_id_fk" FOREIGN KEY ("debit_ledger_entry_id") REFERENCES "public"."credit_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_credit_ledger_entry_id_credit_ledger_id_fk" FOREIGN KEY ("credit_ledger_entry_id") REFERENCES "public"."credit_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_allocations_debit_entry_idx" ON "credit_allocations" USING btree ("debit_ledger_entry_id");--> statement-breakpoint
CREATE INDEX "credit_allocations_credit_entry_idx" ON "credit_allocations" USING btree ("credit_ledger_entry_id");--> statement-breakpoint
CREATE VIEW "public"."active_photographers" AS (select "id", "clerk_id", "email", "name", "stripe_customer_id", "pdpa_consent_at", "balance", "deleted_at", "created_at" from "photographers" where "photographers"."deleted_at" IS NULL);