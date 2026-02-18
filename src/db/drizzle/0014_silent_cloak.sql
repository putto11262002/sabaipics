ALTER TABLE "upload_intents" ADD COLUMN "retryable" boolean;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD COLUMN "r2_cleaned_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "upload_intents_status_retryable_idx" ON "upload_intents" USING btree ("status","retryable");