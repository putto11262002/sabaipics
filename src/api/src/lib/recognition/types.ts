/**
 * Face Recognition v2 — Domain Types
 *
 * Clean types for self-hosted InsightFace + pgvector system.
 * No AWS-compatible shapes, no provider abstraction.
 */

import type { ResultAsync } from 'neverthrow';

// =============================================================================
// Domain Models
// =============================================================================

/**
 * Bounding box for a detected face.
 * Values are ratios of the image dimensions (0-1).
 */
export interface BoundingBox {
  x: number;      // 0-1
  y: number;      // 0-1
  width: number;   // 0-1
  height: number;  // 0-1
}

/**
 * A face detected by the extraction service.
 * Includes the 512-D ArcFace embedding for similarity search.
 */
export interface DetectedFace {
  embedding: number[];      // 512-D ArcFace
  boundingBox: BoundingBox; // 0-1 ratios
  confidence: number;       // 0-1
}

/**
 * Result of calling the /extract endpoint.
 */
export interface ExtractionResult {
  faces: DetectedFace[];
  imageWidth: number;
  imageHeight: number;
  inferenceMs: number;
}

/**
 * A photo match from pgvector similarity search.
 */
export interface PhotoMatch {
  photoId: string;
  similarity: number;  // cosine similarity 0-1
  faceCount: number;
}

// =============================================================================
// Search Options
// =============================================================================

export interface SearchOptions {
  eventId: string;
  embedding: number[];    // 512-D query embedding
  maxResults?: number;     // default 50
  minSimilarity?: number;  // default 0.8
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Recognition error — discriminated union for typed error handling.
 */
export type RecognitionError =
  | { type: 'extraction_failed'; retryable: boolean; throttle: boolean; cause: unknown }
  | { type: 'no_face_detected'; retryable: false; throttle: false }
  | { type: 'invalid_image'; retryable: false; throttle: false; reason: string }
  | { type: 'database'; operation: string; retryable: true; throttle: false; cause: unknown };

// =============================================================================
// Extractor Interface
// =============================================================================

/**
 * Face extractor — calls the Python extraction service.
 * Stateless: image in → embeddings out.
 */
export interface FaceExtractor {
  extractFaces(imageData: ArrayBuffer): ResultAsync<ExtractionResult, RecognitionError>;
}
