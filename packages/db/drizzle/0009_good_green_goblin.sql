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
DROP INDEX "faces_event_id_idx";--> statement-breakpoint
DROP INDEX "faces_provider_idx";--> statement-breakpoint
DROP INDEX "faces_descriptor_hnsw_idx";--> statement-breakpoint
ALTER TABLE "faces" ALTER COLUMN "photo_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "participant_searches" ADD CONSTRAINT "participant_searches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_searches_event_id_idx" ON "participant_searches" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "participant_searches_searched_at_idx" ON "participant_searches" USING btree ("searched_at");--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "event_id";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "confidence";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "attributes";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "raw_response";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "aws_face_id";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "vector_descriptor";--> statement-breakpoint
ALTER TABLE "faces" DROP COLUMN "descriptor";