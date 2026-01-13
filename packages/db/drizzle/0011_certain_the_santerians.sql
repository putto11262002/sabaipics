ALTER TABLE "faces" ALTER COLUMN "photo_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "faces" ADD COLUMN "event_id" text;--> statement-breakpoint
CREATE INDEX "faces_event_id_idx" ON "faces" USING btree ("event_id");