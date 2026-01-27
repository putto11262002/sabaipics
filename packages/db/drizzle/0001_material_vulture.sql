CREATE TABLE "logo_upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"content_type" text NOT NULL,
	"content_length" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "logo_upload_intents_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "subtitle" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "slideshow_config" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "logo_r2_key" text;--> statement-breakpoint
ALTER TABLE "logo_upload_intents" ADD CONSTRAINT "logo_upload_intents_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_upload_intents" ADD CONSTRAINT "logo_upload_intents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logo_upload_intents_r2_key_idx" ON "logo_upload_intents" USING btree ("r2_key");--> statement-breakpoint
CREATE INDEX "logo_upload_intents_status_expires_idx" ON "logo_upload_intents" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "logo_upload_intents_photographer_idx" ON "logo_upload_intents" USING btree ("photographer_id");