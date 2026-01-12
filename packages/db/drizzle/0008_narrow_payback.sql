ALTER TABLE "photos" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "photos_deleted_at_idx" ON "photos" USING btree ("deleted_at");