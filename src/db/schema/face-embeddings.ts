import { pgTable, uuid, jsonb, real, index, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz } from './common';
import { photos } from './photos';

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
    // Drizzle generates the basic HNSW index; WITH params (m, ef_construction)
    // must be hand-edited in the migration SQL.
    index('face_embeddings_embedding_hnsw_idx')
      .using('hnsw', table.embedding.op('vector_cosine_ops')),
  ],
);

export type FaceEmbedding = typeof faceEmbeddings.$inferSelect;
export type NewFaceEmbedding = typeof faceEmbeddings.$inferInsert;
