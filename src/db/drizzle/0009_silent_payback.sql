-- Migrate any in-flight 'uploaded' rows back to 'pending' before removing the status
UPDATE "upload_intents" SET "status" = 'pending' WHERE "status" = 'uploaded';--> statement-breakpoint
UPDATE "logo_upload_intents" SET "status" = 'pending' WHERE "status" = 'uploaded';--> statement-breakpoint
ALTER TABLE "upload_intents" DROP COLUMN "uploaded_at";--> statement-breakpoint
ALTER TABLE "logo_upload_intents" DROP COLUMN "uploaded_at";