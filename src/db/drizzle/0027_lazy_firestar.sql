ALTER TABLE "app_settings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "announcements" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "line_deliveries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP VIEW "public"."active_photographers";--> statement-breakpoint
DROP TABLE "app_settings" CASCADE;--> statement-breakpoint
DROP TABLE "announcements" CASCADE;--> statement-breakpoint
DROP TABLE "feedback" CASCADE;--> statement-breakpoint
DROP TABLE "line_deliveries" CASCADE;--> statement-breakpoint
DROP INDEX "events_deleted_at_expires_at_idx";--> statement-breakpoint
DROP INDEX "photos_event_id_deleted_at_idx";--> statement-breakpoint
ALTER TABLE "photographers" DROP COLUMN "settings";--> statement-breakpoint
CREATE VIEW "public"."active_photographers" AS (select "id", "clerk_id", "email", "name", "stripe_customer_id", "pdpa_consent_at", "balance", "banned_at", "deleted_at", "created_at" from "photographers" where "photographers"."deleted_at" IS NULL);