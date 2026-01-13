/**
 * PostgresVectorStore - Vector storage using Postgres + pgvector
 *
 * Implements VectorStore interface using Postgres with pgvector extension.
 * Uses HNSW index for fast cosine similarity search on 128-D face descriptors.
 *
 * Key features:
 * - No separate vector database needed
 * - Fast similarity search with HNSW index
 * - Cosine distance metric (0 = identical, 2 = opposite)
 * - Collection-based isolation using eventId filtering
 *
 * IMPORTANT: Transactions are NOT available. Each database operation
 * must be independent and handle partial failures gracefully.
 */

import type { InternalDatabase } from '../../db';
import { faces } from '../../db/schema';
import { eq, and, inArray, sql, type SQL } from 'drizzle-orm';
import type {
  VectorStore,
  FaceMetadata,
  FaceMatch,
  FaceData,
} from '../../core/vector-store';
import { distanceToSimilarity } from '../../core/vector-store';

// =============================================================================
// PostgresVectorStore Implementation
// =============================================================================

/**
 * Vector store implementation using Postgres + pgvector.
 *
 * Uses pgvector extension for efficient similarity search.
 * Collections are implemented as eventId filtering (no physical collections).
 */
export class PostgresVectorStore implements VectorStore {
  constructor(private db: InternalDatabase) {}

  /**
   * Create a new collection.
   *
   * For Postgres, collections are logical (just eventId filtering).
   * This is a no-op but maintains interface compatibility.
   *
   * @param collectionId - Event ID (used for filtering)
   */
  async createCollection(collectionId: string): Promise<void> {
    // No-op: Collections are just eventId filtering in Postgres
    // No physical collection to create
  }

  /**
   * Delete a collection and all its faces.
   *
   * Deletes all faces for the given eventId.
   *
   * @param collectionId - Event ID
   */
  async deleteCollection(collectionId: string): Promise<void> {
    // Delete all faces for this event using eventId directly
    await this.db.delete(faces).where(eq(faces.eventId, collectionId));
  }

  /**
   * List all collections.
   *
   * Returns distinct event IDs that have indexed faces.
   *
   * @returns Array of event IDs (collection IDs)
   */
  async listCollections(): Promise<string[]> {
    // Get distinct event IDs from faces table (internal DB)
    const result = await this.db.execute<{ event_id: string }>(sql`
      SELECT DISTINCT event_id
      FROM ${faces}
      WHERE provider = 'sabaiface'
      AND descriptor IS NOT NULL
    `);

    return result.map((row) => row.event_id);
  }

  /**
   * Add faces to a collection.
   *
   * Inserts faces with vector descriptors into the database.
   * Uses eventId from metadata to associate with photos.
   *
   * IMPORTANT: No transactions available. Handles partial failures gracefully.
   *
   * @param collectionId - Event ID (for logging, actual association is via photoId)
   * @param faces - Array of faces with descriptors and metadata
   */
  async addFaces(
    collectionId: string,
    facesToAdd: Array<{
      faceId: string;
      descriptor: Float32Array;
      metadata: FaceMetadata;
    }>
  ): Promise<void> {
    if (facesToAdd.length === 0) {
      return;
    }

    // Convert faces to database rows
    const faceRows = facesToAdd.map((face) => ({
      id: face.faceId,
      eventId: collectionId, // Store eventId for filtering and deletion
      photoId: face.metadata.externalImageId, // photoId from metadata (can be null for testing)
      provider: 'sabaiface' as const,
      confidence: face.metadata.confidence?.toString(), // Store as string
      descriptor: Array.from(face.descriptor), // Convert Float32Array to regular array
      boundingBox: JSON.stringify({
        Width: face.metadata.boundingBox.width,
        Height: face.metadata.boundingBox.height,
        Left: face.metadata.boundingBox.x,
        Top: face.metadata.boundingBox.y,
      }), // Store as JSON string
      // indexedAt will use default from database (defaultNow)
    }));

    try {
      // Insert faces (no transaction available)
      await this.db.insert(faces).values(faceRows);
    } catch (error) {
      throw new Error(`Failed to insert faces into database`);
    }
  }

  /**
   * Search for similar faces in a collection.
   *
   * Uses pgvector cosine distance for similarity search.
   * Returns faces sorted by similarity (highest first).
   *
   * @param collectionId - Event ID
   * @param queryDescriptor - 128-D query vector
   * @param maxResults - Maximum number of results
   * @param threshold - Euclidean distance threshold (faces closer than this)
   * @returns Array of face matches, sorted by similarity (highest first)
   */
  async searchFaces(
    collectionId: string,
    queryDescriptor: Float32Array,
    maxResults: number,
    threshold: number
  ): Promise<FaceMatch[]> {
    // Convert Float32Array to array for SQL
    const queryVector = Array.from(queryDescriptor);

    // Search using cosine distance (<=> operator)
    // Note: Cosine distance range is 0-2 (0 = identical, 2 = opposite)
    // We filter by threshold to limit results to similar faces
    const result = await this.db.execute<{
      id: string;
      photo_id: string;
      confidence: string;
      bounding_box: string;
      indexed_at: string;
      distance: number;
    }>(sql`
      SELECT
        id,
        photo_id,
        confidence,
        bounding_box,
        indexed_at,
        (descriptor <=> ${sql`${queryVector}::vector`}) as distance
      FROM ${faces}
      WHERE event_id = ${collectionId}
        AND provider = 'sabaiface'
        AND descriptor IS NOT NULL
        AND (descriptor <=> ${sql`${queryVector}::vector`}) < ${threshold}
      ORDER BY descriptor <=> ${sql`${queryVector}::vector`}
      LIMIT ${maxResults}
    `);

    // Convert to FaceMatch objects
    return result.map((row) => {
      const boundingBox = JSON.parse(row.bounding_box) as {
        Width: number;
        Height: number;
        Left: number;
        Top: number;
      };
      return {
        faceId: row.id,
        distance: row.distance,
        similarity: distanceToSimilarity(row.distance),
        metadata: {
          externalImageId: row.photo_id || '',
          boundingBox: {
            x: boundingBox.Left,
            y: boundingBox.Top,
            width: boundingBox.Width,
            height: boundingBox.Height,
          },
          confidence: row.confidence ? parseFloat(row.confidence) : 0,
          indexedAt: row.indexed_at,
        },
      };
    });
  }

  /**
   * Delete specific faces from a collection.
   *
   * @param collectionId - Event ID (for validation)
   * @param faceIds - Array of face IDs to delete
   */
  async deleteFaces(collectionId: string, faceIds: string[]): Promise<void> {
    if (faceIds.length === 0) {
      return;
    }

    try {
      // Delete faces by ID
      // Note: We could add eventId validation via join, but for now trust the caller
      await this.db
        .delete(faces)
        .where(
          and(
            eq(faces.provider, 'sabaiface'),
            inArray(faces.id, faceIds)
          )
        );

      console.log(`Deleted ${faceIds.length} faces from collection ${collectionId}`);
    } catch (error) {
      console.error(`Failed to delete faces from collection ${collectionId}:`, error);
      throw error;
    }
  }

  /**
   * Get face data by ID.
   *
   * @param collectionId - Event ID (for validation)
   * @param faceId - Face identifier
   * @returns Face data with descriptor, or null if not found
   */
  async getFace(collectionId: string, faceId: string): Promise<FaceData | null> {
    // Query face with descriptor
    const result = await this.db.execute<{
      id: string;
      photo_id: string;
      confidence: string;
      descriptor: number[];
      bounding_box: string;
      indexed_at: string;
    }>(sql`
      SELECT
        id,
        photo_id,
        confidence,
        descriptor,
        bounding_box,
        indexed_at
      FROM ${faces}
      WHERE id = ${faceId}
        AND event_id = ${collectionId}
        AND provider = 'sabaiface'
        AND descriptor IS NOT NULL
      LIMIT 1
    `);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    const boundingBox = JSON.parse(row.bounding_box) as {
      Width: number;
      Height: number;
      Left: number;
      Top: number;
    };
    return {
      faceId: row.id,
      descriptor: new Float32Array(row.descriptor),
      metadata: {
        externalImageId: row.photo_id || '',
        boundingBox: {
          x: boundingBox.Left,
          y: boundingBox.Top,
          width: boundingBox.Width,
          height: boundingBox.Height,
        },
        confidence: row.confidence ? parseFloat(row.confidence) : 0,
        indexedAt: row.indexed_at,
      },
    };
  }
}
