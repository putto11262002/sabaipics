/**
 * Face Search — pgvector Similarity Search
 *
 * Queries the face_embeddings table using cosine distance (<=>).
 * Groups results by photo, keeps max similarity per photo.
 */

import { ResultAsync } from 'neverthrow';
import { sql } from 'drizzle-orm';
import type { Database } from '@/db';
import type { SearchOptions, PhotoMatch, RecognitionError } from './types';

/**
 * Search for photos containing faces similar to the query embedding.
 *
 * Uses pgvector's cosine distance operator (<=>):
 *   cosine_similarity = 1 - (embedding <=> query_vector)
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

  // Format embedding as pgvector literal
  const vectorLiteral = `[${embedding.join(',')}]`;

  return ResultAsync.fromPromise(
    db.execute<{
      photo_id: string;
      similarity: number;
      face_count: number;
    }>(sql`
      SELECT
        fe.photo_id,
        MAX(1 - (fe.embedding <=> ${vectorLiteral}::vector)) AS similarity,
        COUNT(*)::int AS face_count
      FROM face_embeddings fe
      JOIN photos p ON p.id = fe.photo_id
      WHERE p.event_id = ${eventId}
        AND p.status = 'indexed'
        AND p.deleted_at IS NULL
      GROUP BY fe.photo_id
      HAVING MAX(1 - (fe.embedding <=> ${vectorLiteral}::vector)) >= ${minSimilarity}
      ORDER BY similarity DESC
      LIMIT ${maxResults}
    `),
    (cause): RecognitionError => ({
      type: 'database',
      operation: 'search_by_face',
      retryable: true,
      throttle: false,
      cause,
    }),
  ).map((result) =>
    result.rows.map((row) => ({
      photoId: row.photo_id,
      similarity: Number(row.similarity),
      faceCount: Number(row.face_count),
    })),
  );
}
