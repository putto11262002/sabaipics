ALTER TABLE "photos" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "file_size" integer;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "original_mime_type" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "original_file_size" integer;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "indexed_at" timestamp with time zone;