/**
 * Face Search — pgvector Similarity Search
 *
 * Queries the face_embeddings table using cosine distance.
 * Groups results by photo, keeps max similarity per photo.
 */

import { ResultAsync } from 'neverthrow';
import { cosineDistance, sql, desc, eq, and, isNull } from 'drizzle-orm';
import { faceEmbeddings, photos } from '@/db';
import type { Database } from '@/db';
import type { SearchOptions, PhotoMatch, RecognitionError } from './types';

/**
 * Search for photos containing faces similar to the query embedding.
 *
 * Uses Drizzle's cosineDistance() helper (maps to pgvector's <=> operator):
 *   cosine_similarity = 1 - cosineDistance(embedding, query)
 *
 * Filters: event_id, photo status='indexed', not deleted.
 * Groups by photo_id, keeps max similarity per photo.
 */
export function searchByFace(
  db: Database,
  options: SearchOptions,
): ResultAsync<PhotoMatch[], RecognitionError> {
  const {
    eventId,
    embedding,
    maxResults = 50,
    minSimilarity = 0.8,
  } = options;

  const distance = cosineDistance(faceEmbeddings.embedding, embedding);
  const similarity = sql<number>`1 - (${distance})`;

  return ResultAsync.fromPromise(
    db
      .select({
        photoId: faceEmbeddings.photoId,
        similarity: sql<number>`MAX(${similarity})`,
        faceCount: sql<number>`COUNT(*)::int`,
      })
      .from(faceEmbeddings)
      .innerJoin(photos, eq(photos.id, faceEmbeddings.photoId))
      .where(
        and(
          eq(photos.eventId, eventId),
          eq(photos.status, 'indexed'),
          isNull(photos.deletedAt),
        ),
      )
      .groupBy(faceEmbeddings.photoId)
      .having(sql`MAX(${similarity}) >= ${minSimilarity}`)
      .orderBy(desc(sql`MAX(${similarity})`))
      .limit(maxResults),
    (cause): RecognitionError => ({
      type: 'database',
      operation: 'search_by_face',
      retryable: true,
      throttle: false,
      cause,
    }),
  ).map((rows) =>
    rows.map((row) => ({
      photoId: row.photoId,
      similarity: Number(row.similarity),
      faceCount: Number(row.faceCount),
    })),
  );
}
