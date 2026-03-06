CREATE TABLE "photo_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_intent_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"photographer_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"orchestrator_run_id" text,
	"original_r2_key" text,
	"processed_r2_key" text,
	"error_code" text,
	"error_message" text,
	"retryable" boolean,
	"credits_debited" integer DEFAULT 0 NOT NULL,
	"credits_refunded" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "photo_jobs" ADD CONSTRAINT "photo_jobs_upload_intent_id_upload_intents_id_fk" FOREIGN KEY ("upload_intent_id") REFERENCES "public"."upload_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_jobs" ADD CONSTRAINT "photo_jobs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_jobs" ADD CONSTRAINT "photo_jobs_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photo_jobs_upload_intent_id_uidx" ON "photo_jobs" USING btree ("upload_intent_id");--> statement-breakpoint
CREATE INDEX "photo_jobs_status_idx" ON "photo_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "photo_jobs_event_status_idx" ON "photo_jobs" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "photo_jobs_photographer_status_idx" ON "photo_jobs" USING btree ("photographer_id","status");--> statement-breakpoint
CREATE INDEX "photo_jobs_orchestrator_run_id_idx" ON "photo_jobs" USING btree ("orchestrator_run_id");--> statement-breakpoint
CREATE INDEX "photo_jobs_created_at_idx" ON "photo_jobs" USING btree ("created_at");