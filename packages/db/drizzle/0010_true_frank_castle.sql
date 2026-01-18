-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
-- Add vector descriptor column
ALTER TABLE "faces" ADD COLUMN "descriptor" vector(128);--> statement-breakpoint
-- Create HNSW index for fast similarity search using cosine distance
CREATE INDEX "faces_descriptor_hnsw_idx" ON "faces" USING hnsw ("descriptor" vector_cosine_ops);