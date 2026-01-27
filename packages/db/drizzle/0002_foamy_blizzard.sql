CREATE TABLE "ftp_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"photographer_id" uuid NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ftp_credentials_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "ftp_credentials_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "upload_intents" ALTER COLUMN "content_length" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD COLUMN "source" text DEFAULT 'web';--> statement-breakpoint
ALTER TABLE "ftp_credentials" ADD CONSTRAINT "ftp_credentials_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ftp_credentials" ADD CONSTRAINT "ftp_credentials_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ftp_credentials_event_id_idx" ON "ftp_credentials" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "ftp_credentials_photographer_id_idx" ON "ftp_credentials" USING btree ("photographer_id");--> statement-breakpoint
CREATE INDEX "ftp_credentials_username_idx" ON "ftp_credentials" USING btree ("username");