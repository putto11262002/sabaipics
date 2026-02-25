/**
 * Face Embedding Storage — Persistence Layer
 *
 * Bulk inserts face embeddings into the face_embeddings table.
 * Uses Drizzle with the customType vector serializer.
 */

import { ResultAsync } from 'neverthrow';
import { faceEmbeddings } from '@/db';
import type { Transaction } from '@/db';
import type { DetectedFace, RecognitionError } from './types';

/**
 * Insert face embeddings for a photo in a single batch.
 *
 * @param tx - Drizzle transaction (from db.transaction callback)
 * @param photoId - UUID of the photo these faces belong to
 * @param faces - Detected faces with embeddings from the extraction service
 */
export function insertFaceEmbeddings(
  tx: Transaction,
  photoId: string,
  faces: DetectedFace[],
): ResultAsync<void, RecognitionError> {
  if (faces.length === 0) {
    return ResultAsync.fromSafePromise(Promise.resolve(undefined));
  }

  const rows = faces.map((face) => ({
    photoId,
    embedding: face.embedding,
    boundingBox: face.boundingBox,
    confidence: face.confidence,
  }));

  return ResultAsync.fromPromise(
    tx.insert(faceEmbeddings).values(rows).then(() => undefined),
    (cause): RecognitionError => ({
      type: 'database',
      operation: 'insert_face_embeddings',
      retryable: true,
      throttle: false,
      cause,
    }),
  );
}
