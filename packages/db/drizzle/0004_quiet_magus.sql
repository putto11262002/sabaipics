ALTER TABLE "photos" ALTER COLUMN "status" SET DEFAULT 'uploading';--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "retryable" integer;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "error_message" text;
