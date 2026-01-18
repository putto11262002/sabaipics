ALTER TABLE "faces" ADD COLUMN "provider" text DEFAULT 'aws' NOT NULL;--> statement-breakpoint
ALTER TABLE "faces" ADD COLUMN "confidence" real;--> statement-breakpoint
ALTER TABLE "faces" ADD COLUMN "attributes" jsonb;--> statement-breakpoint
ALTER TABLE "faces" ADD COLUMN "raw_response" jsonb;--> statement-breakpoint
ALTER TABLE "faces" ADD COLUMN "aws_face_id" text;--> statement-breakpoint
ALTER TABLE "faces" ADD COLUMN "vector_descriptor" text;--> statement-breakpoint
CREATE INDEX "faces_provider_idx" ON "faces" USING btree ("provider");