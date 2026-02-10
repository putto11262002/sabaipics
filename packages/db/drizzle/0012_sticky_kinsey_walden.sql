CREATE TABLE "photo_luts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"upload_r2_key" text NOT NULL,
	"lut_r2_key" text,
	"content_type" text NOT NULL,
	"content_length" integer NOT NULL,
	"error_code" text,
	"error_message" text,
	"lut_size" integer,
	"title" text,
	"domain_min" jsonb,
	"domain_max" jsonb,
	"sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "photo_luts_upload_r2_key_unique" UNIQUE("upload_r2_key")
);
--> statement-breakpoint
DROP VIEW "public"."active_events";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "settings" jsonb;--> statement-breakpoint
ALTER TABLE "photo_luts" ADD CONSTRAINT "photo_luts_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_luts_photographer_id_idx" ON "photo_luts" USING btree ("photographer_id");--> statement-breakpoint
CREATE INDEX "photo_luts_photographer_created_at_idx" ON "photo_luts" USING btree ("photographer_id","created_at");--> statement-breakpoint
CREATE INDEX "photo_luts_status_idx" ON "photo_luts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "photo_luts_status_expires_idx" ON "photo_luts" USING btree ("status","expires_at");--> statement-breakpoint
CREATE VIEW "public"."active_events" AS (select "id", "photographer_id", "name", "subtitle", "start_date", "end_date", "qr_code_r2_key", "rekognition_collection_id", "slideshow_config", "logo_r2_key", "settings", "expires_at", "deleted_at", "created_at" from "events" where "events"."deleted_at" IS NULL);