import { pgTable, text, uuid, index, vector } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamptz } from "./common";

// =============================================================================
// SabaiFace Internal Database Schema
// =============================================================================

/**
 * Internal faces table for SabaiFace service.
 *
 * This table stores:
 * - Face descriptors (128-D vectors for similarity search)
 * - Face metadata (bounding box, confidence)
 * - Event and photo associations (external references)
 *
 * Key differences from main DB:
 * - Uses pgvector for efficient similarity search
 * - Stores descriptors as native vector type
 * - Optimized for vector operations (HNSW indexing)
 * - Isolated from main application database
 */
export const faces = pgTable(
  "faces",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // External references (link to main app via IDs only)
    eventId: text("event_id").notNull(), // Event/collection ID
    photoId: text("photo_id"), // Photo ID from main app (nullable for testing)

    // Face detection metadata
    provider: text("provider").notNull().default("sabaiface"), // 'sabaiface' or 'aws'
    confidence: text("confidence"), // Detection confidence (0-1)

    // Vector descriptor (128-D face embedding)
    // Uses pgvector for efficient cosine similarity search
    descriptor: vector("descriptor", { dimensions: 128 }),

    // Bounding box (quick access for display)
    boundingBox: text("bounding_box"), // JSON string: {Width, Height, Left, Top}

    // Timestamps
    indexedAt: timestamptz("indexed_at").defaultNow().notNull(),
  },
  (table) => [
    // Index for event-based queries (collection filtering)
    index("faces_event_id_idx").on(table.eventId),

    // Index for provider filtering
    index("faces_provider_idx").on(table.provider),

    // HNSW index for fast vector similarity search
    // Uses cosine distance (vector_cosine_ops)
    index("faces_descriptor_hnsw_idx").using(
      "hnsw",
      table.descriptor.op("vector_cosine_ops")
    ),
  ]
);

export type Face = typeof faces.$inferSelect;
export type NewFace = typeof faces.$inferInsert;
