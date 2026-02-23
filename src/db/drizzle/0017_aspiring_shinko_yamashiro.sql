DROP VIEW "public"."active_photographers";--> statement-breakpoint
ALTER TABLE "photographers" ADD COLUMN "banned_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "photographers_banned_at_idx" ON "photographers" USING btree ("banned_at");--> statement-breakpoint
CREATE VIEW "public"."active_photographers" AS (select "id", "clerk_id", "email", "name", "stripe_customer_id", "pdpa_consent_at", "balance", "banned_at", "deleted_at", "created_at" from "photographers" where "photographers"."deleted_at" IS NULL);