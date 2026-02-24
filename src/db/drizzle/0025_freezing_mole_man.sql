CREATE TABLE "line_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"search_id" uuid NOT NULL,
	"line_user_id" text NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"photo_count" integer DEFAULT 0 NOT NULL,
	"credit_charged" boolean DEFAULT false NOT NULL,
	"credit_ledger_entry_id" uuid,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP VIEW "public"."active_photographers";--> statement-breakpoint
ALTER TABLE "photographers" ADD COLUMN "settings" jsonb;--> statement-breakpoint
ALTER TABLE "line_deliveries" ADD CONSTRAINT "line_deliveries_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_deliveries" ADD CONSTRAINT "line_deliveries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_deliveries" ADD CONSTRAINT "line_deliveries_search_id_participant_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."participant_searches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_deliveries" ADD CONSTRAINT "line_deliveries_credit_ledger_entry_id_credit_ledger_id_fk" FOREIGN KEY ("credit_ledger_entry_id") REFERENCES "public"."credit_ledger"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "line_deliveries_photographer_id_idx" ON "line_deliveries" USING btree ("photographer_id");--> statement-breakpoint
CREATE INDEX "line_deliveries_event_id_idx" ON "line_deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "line_deliveries_search_id_idx" ON "line_deliveries" USING btree ("search_id");--> statement-breakpoint
CREATE INDEX "line_deliveries_photographer_created_idx" ON "line_deliveries" USING btree ("photographer_id","created_at");--> statement-breakpoint
CREATE VIEW "public"."active_photographers" AS (select "id", "clerk_id", "email", "name", "stripe_customer_id", "pdpa_consent_at", "balance", "settings", "banned_at", "deleted_at", "created_at" from "photographers" where "photographers"."deleted_at" IS NULL);