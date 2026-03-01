ALTER TABLE "line_deliveries" DROP CONSTRAINT "line_deliveries_event_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "line_deliveries" DROP CONSTRAINT "line_deliveries_search_id_participant_searches_id_fk";
--> statement-breakpoint
ALTER TABLE "line_deliveries" ALTER COLUMN "event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "line_deliveries" ALTER COLUMN "search_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "line_deliveries" ADD CONSTRAINT "line_deliveries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_deliveries" ADD CONSTRAINT "line_deliveries_search_id_participant_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."participant_searches"("id") ON DELETE set null ON UPDATE no action;