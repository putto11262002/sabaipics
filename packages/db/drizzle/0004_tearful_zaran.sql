ALTER TABLE "photos" ALTER COLUMN "status" SET DEFAULT 'uploading';--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "retryable" boolean;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "error_message" text;