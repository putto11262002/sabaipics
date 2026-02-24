/**
 * Vector Store Abstraction
 *
 * Interface for vector database operations.
 * Implementations: LanceDB (local dev), Cloudflare Vectorize (production)
 *
 * NOTE: Vectors (128-D descriptors) are implementation details,
 * never exposed via public API.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Face metadata stored with vector
 */
export interface FaceMetadata {
  externalImageId: string; // photoId from SabaiPics
  boundingBox: {
    x: number; // Pixel coordinates
    y: number;
    width: number;
    height: number;
  };
  confidence: number; // Detection confidence (0-1)
  indexedAt: string; // ISO timestamp
}

/**
 * Face match result from vector search
 */
export interface FaceMatch {
  faceId: string;
  distance: number; // Euclidean distance (0 = perfect match)
  similarity: number; // Converted to percentage (0-100)
  metadata: FaceMetadata;
}

/**
 * Face data with descriptor
 */
export interface FaceData {
  faceId: string;
  descriptor: Float32Array; // 128-D vector
  metadata: FaceMetadata;
}

// =============================================================================
// Vector Store Interface
// =============================================================================

/**
 * Vector database abstraction for face recognition.
 *
 * All implementations MUST:
 * - Keep vectors internal (never expose via API)
 * - Use Euclidean distance for similarity
 * - Support collection-based isolation (one collection per event)
 */
export interface VectorStore {
  /**
   * Create a new collection.
   *
   * @param collectionId - Unique collection identifier (typically eventId)
   */
  createCollection(collectionId: string): Promise<void>;

  /**
   * Delete a collection and all its faces.
   *
   * @param collectionId - Collection identifier
   */
  deleteCollection(collectionId: string): Promise<void>;

  /**
   * List all collections.
   *
   * @returns Array of collection IDs
   */
  listCollections(): Promise<string[]>;

  /**
   * Add faces to a collection.
   *
   * @param collectionId - Collection identifier
   * @param faces - Array of faces with descriptors and metadata
   */
  addFaces(
    collectionId: string,
    faces: Array<{
      faceId: string;
      descriptor: Float32Array; // 128-D vector (INTERNAL ONLY)
      metadata: FaceMetadata;
    }>,
  ): Promise<void>;

  /**
   * Search for similar faces in a collection.
   *
   * @param collectionId - Collection identifier
   * @param queryDescriptor - 128-D query vector
   * @param maxResults - Maximum number of results to return
   * @param threshold - Euclidean distance threshold (e.g., 0.6)
   * @returns Array of face matches, sorted by similarity (highest first)
   */
  searchFaces(
    collectionId: string,
    queryDescriptor: Float32Array,
    maxResults: number,
    threshold: number,
  ): Promise<FaceMatch[]>;

  /**
   * Delete specific faces from a collection.
   *
   * @param collectionId - Collection identifier
   * @param faceIds - Array of face IDs to delete
   */
  deleteFaces(collectionId: string, faceIds: string[]): Promise<void>;

  /**
   * Get face data by ID.
   *
   * @param collectionId - Collection identifier
   * @param faceId - Face identifier
   * @returns Face data with descriptor, or null if not found
   */
  getFace(collectionId: string, faceId: string): Promise<FaceData | null>;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert Euclidean distance to similarity percentage.
 * Uses empirical mapping: 0.6 distance ≈ 80% similarity
 *
 * @param distance - Euclidean distance (0 = identical)
 * @returns Similarity percentage (0-100)
 */
export function distanceToSimilarity(distance: number): number {
  // Empirical formula: similarity = 100 * (1 - distance / 1.5)
  // 0.0 distance → 100% similarity
  // 0.6 distance → 60% similarity
  // 1.5 distance → 0% similarity
  const similarity = Math.max(0, Math.min(100, 100 * (1 - distance / 1.5)));
  return Math.round(similarity * 100) / 100; // Round to 2 decimals
}

/**
 * Convert similarity percentage to Euclidean distance threshold.
 *
 * @param similarity - Similarity percentage (0-100)
 * @returns Euclidean distance threshold
 */
export function similarityToDistance(similarity: number): number {
  // Inverse of distanceToSimilarity
  // 100% similarity → 0.0 distance
  // 80% similarity → 0.3 distance
  // 60% similarity → 0.6 distance
  return 1.5 * (1 - similarity / 100);
}
