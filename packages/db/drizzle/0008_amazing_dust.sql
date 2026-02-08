CREATE TABLE "promo_code_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" uuid NOT NULL,
	"promo_code" text NOT NULL,
	"stripe_session_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_code_usage_photographer_code_unique" UNIQUE("photographer_id","promo_code")
);
--> statement-breakpoint
-- Add new columns (nullable initially for data migration)
ALTER TABLE "credit_ledger" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "promo_code" text;--> statement-breakpoint
-- Migrate existing data from old schema to new schema
-- Set source based on old type value
UPDATE "credit_ledger" SET "source" = 'purchase' WHERE "type" = 'purchase';--> statement-breakpoint
UPDATE "credit_ledger" SET "source" = 'upload' WHERE "type" = 'upload';--> statement-breakpoint
-- Update type column to new values (credit/debit)
UPDATE "credit_ledger" SET "type" = 'credit' WHERE "source" = 'purchase';--> statement-breakpoint
UPDATE "credit_ledger" SET "type" = 'debit' WHERE "source" = 'upload';--> statement-breakpoint
-- Make source NOT NULL now that data is migrated
ALTER TABLE "credit_ledger" ALTER COLUMN "source" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_code_usage" ADD CONSTRAINT "promo_code_usage_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promo_code_usage_photographer_code_idx" ON "promo_code_usage" USING btree ("photographer_id","promo_code");--> statement-breakpoint
CREATE INDEX "promo_code_usage_session_idx" ON "promo_code_usage" USING btree ("stripe_session_id");