DROP VIEW "public"."active_photographers";--> statement-breakpoint
ALTER TABLE "photographers" ADD COLUMN "cleaned_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "photographers_cleaned_at_idx" ON "photographers" USING btree ("cleaned_at");--> statement-breakpoint
CREATE VIEW "public"."active_photographers" AS (select "id", "clerk_id", "email", "name", "stripe_customer_id", "pdpa_consent_at", "balance", "balance_invalidate_at", "settings", "banned_at", "deleted_at", "cleaned_at", "created_at" from "photographers" where "photographers"."deleted_at" IS NULL);