CREATE TABLE "participant_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"line_user_id" text,
	"is_friend" boolean DEFAULT false NOT NULL,
	"consent_accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "participant_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "selfies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"embedding" vector(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"search_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"photo_ids" uuid[] NOT NULL,
	"method" text NOT NULL,
	"photo_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participant_searches" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "participant_searches" ADD COLUMN "selfie_id" uuid;--> statement-breakpoint
ALTER TABLE "participant_searches" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "line_deliveries" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "selfies" ADD CONSTRAINT "selfies_session_id_participant_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."participant_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_session_id_participant_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."participant_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_search_id_participant_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."participant_searches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_sessions_token_idx" ON "participant_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "participant_sessions_line_user_id_idx" ON "participant_sessions" USING btree ("line_user_id");--> statement-breakpoint
CREATE INDEX "participant_sessions_deleted_at_expires_at_idx" ON "participant_sessions" USING btree ("deleted_at","expires_at");--> statement-breakpoint
CREATE INDEX "selfies_session_id_idx" ON "selfies" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "downloads_session_id_idx" ON "downloads" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "downloads_search_id_idx" ON "downloads" USING btree ("search_id");--> statement-breakpoint
ALTER TABLE "participant_searches" ADD CONSTRAINT "participant_searches_session_id_participant_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."participant_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_searches" ADD CONSTRAINT "participant_searches_selfie_id_selfies_id_fk" FOREIGN KEY ("selfie_id") REFERENCES "public"."selfies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_deliveries" ADD CONSTRAINT "line_deliveries_session_id_participant_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."participant_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_searches_session_id_idx" ON "participant_searches" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "line_deliveries_session_id_idx" ON "line_deliveries" USING btree ("session_id");--> statement-breakpoint
CREATE VIEW "public"."active_participant_sessions" AS (select "id", "token", "line_user_id", "is_friend", "consent_accepted_at", "expires_at", "created_at", "deleted_at" from "participant_sessions" where "participant_sessions"."deleted_at" IS NULL AND "participant_sessions"."expires_at" > now());