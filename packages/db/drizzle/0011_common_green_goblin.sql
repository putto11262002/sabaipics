CREATE TABLE "upload_intents" (
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
	CONSTRAINT "upload_intents_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
CREATE TABLE "participant_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"selfie_r2_key" text,
	"consent_accepted_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"matched_photo_ids" uuid[],
	"match_count" integer,
	"searched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_access_code_unique";--> statement-breakpoint
DROP INDEX "events_access_code_idx";--> statement-breakpoint
DROP INDEX "faces_event_id_idx";--> statement-breakpoint
DROP INDEX "faces_provider_idx";--> statement-breakpoint
DROP INDEX "faces_descriptor_hnsw_idx";--> statement-breakpoint
ALTER TABLE "faces" ALTER COLUMN "photo_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_searches" ADD CONSTRAINT "participant_searches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_intents_r2_key_idx" ON "upload_intents" USING btree ("r2_key");--> statement-breakpoint
CREATE INDEX "upload_intents_status_expires_idx" ON "upload_intents" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "upload_intents_photographer_idx" ON "upload_intents" USING btree ("photographer_id");--> statement-breakpoint
CREATE INDEX "participant_searches_event_id_idx" ON "participant_searches" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "participant_searches_searched_at_idx" ON "participant_searches" USING btree ("searched_at");--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "access_code";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "event_id";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "confidence";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "attributes";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "raw_response";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "aws_face_id";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "vector_descriptor";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "descriptor";