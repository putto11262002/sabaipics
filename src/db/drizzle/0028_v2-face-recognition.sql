-- v2 Face Recognition: pgvector embeddings replace AWS Rekognition
-- Requires: 0027_enable-pgvector (CREATE EXTENSION vector)

-- 1. Create face_embeddings table (InsightFace 512-D ArcFace embeddings)
CREATE TABLE "face_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"embedding" vector(512) NOT NULL,
	"bounding_box" jsonb NOT NULL,
	"confidence" real NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "face_embeddings" ADD CONSTRAINT "face_embeddings_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "face_embeddings_photo_id_idx" ON "face_embeddings" USING btree ("photo_id");
--> statement-breakpoint
CREATE INDEX "face_embeddings_embedding_hnsw_idx" ON "face_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 128);
--> statement-breakpoint

-- 2. Drop legacy AWS Rekognition table
DROP TABLE "faces" CASCADE;
--> statement-breakpoint

-- 3. Drop legacy rekognition_collection_id from events
-- The active_events view uses SELECT * and depends on this column,
-- so we drop it first and recreate after the column is removed.
DROP VIEW IF EXISTS "public"."active_events";
--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "rekognition_collection_id";
--> statement-breakpoint
CREATE VIEW "public"."active_events" AS (SELECT "id", "photographer_id", "name", "subtitle", "start_date", "end_date", "qr_code_r2_key", "slideshow_config", "logo_r2_key", "settings", "expires_at", "deleted_at", "created_at" FROM "events" WHERE "deleted_at" IS NULL);
