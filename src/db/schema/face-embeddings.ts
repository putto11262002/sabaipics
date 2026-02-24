import { pgTable, uuid, jsonb, real, index, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz } from './common';
import { photos } from './photos';

// =============================================================================
// pgvector Custom Type
// =============================================================================

/**
 * Custom Drizzle type for pgvector's vector(512) column.
 * Drizzle has no native pgvector support, so we use customType.
 *
 * Storage: pgvector binary format
 * JS representation: number[] (512-element float array)
 */
const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 512})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns "[0.1,0.2,...]" format
    return value
      .slice(1, -1)
      .split(',')
      .map(Number);
  },
});

// =============================================================================
// Bounding Box Type
// =============================================================================

/**
 * Bounding box for a detected face.
 * Values are ratios of the image dimensions (0-1).
 */
export interface FaceEmbeddingBoundingBox {
  x: number;      // 0-1
  y: number;      // 0-1
  width: number;   // 0-1
  height: number;  // 0-1
}

// =============================================================================
// Face Embeddings Table
// =============================================================================

export const faceEmbeddings = pgTable(
  'face_embeddings',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photoId: uuid('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    embedding: vector('embedding', { dimensions: 512 }).notNull(),
    boundingBox: jsonb('bounding_box').$type<FaceEmbeddingBoundingBox>().notNull(),
    confidence: real('confidence').notNull(),
    indexedAt: timestamptz('indexed_at').defaultNow().notNull(),
  },
  (table) => [
    index('face_embeddings_photo_id_idx').on(table.photoId),
    // HNSW index created via raw SQL migration (not expressible in Drizzle):
    // CREATE INDEX face_embeddings_embedding_hnsw_idx ON face_embeddings
    //   USING hnsw (embedding vector_cosine_ops)
    //   WITH (m = 16, ef_construction = 64);
  ],
);

export type FaceEmbedding = typeof faceEmbeddings.$inferSelect;
export type NewFaceEmbedding = typeof faceEmbeddings.$inferInsert;
