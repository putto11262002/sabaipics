/**
 * Domain Layer: Face Recognition Service Interface
 *
 * Provider-agnostic interface for face recognition operations.
 * All confidence scores normalized to 0-1 scale (not 0-100).
 * Clean business terminology (no AWS-specific terms).
 *
 * All methods return ResultAsync for typed error handling.
 * See errors.ts for FaceServiceError discriminated union.
 */

// =============================================================================
// Domain Models
// =============================================================================

/**
 * Bounding box for a detected face.
 * Values are ratios of the image dimensions (0-1).
 */
export interface BoundingBox {
  width: number;   // 0-1
  height: number;  // 0-1
  left: number;    // 0-1
  top: number;     // 0-1
}

/**
 * Age range estimation
 */
export interface AgeRange {
  low?: number;
  high?: number;
}

/**
 * Emotion detection
 */
export interface Emotion {
  type: string;      // e.g., 'HAPPY', 'SAD', 'ANGRY'
  confidence: number; // 0-1
}

/**
 * Gender estimation
 */
export interface Gender {
  value: string;     // 'Male' | 'Female'
  confidence: number; // 0-1
}

/**
 * Face attributes (age, gender, emotions)
 */
export interface FaceAttributes {
  age?: AgeRange;
  gender?: Gender;
  emotions?: Emotion[];
  smile?: { value: boolean; confidence: number };
  eyeglasses?: { value: boolean; confidence: number };
  sunglasses?: { value: boolean; confidence: number };
  beard?: { value: boolean; confidence: number };
  mustache?: { value: boolean; confidence: number };
  eyesOpen?: { value: boolean; confidence: number };
  mouthOpen?: { value: boolean; confidence: number };
}

/**
 * Detected and indexed face
 */
export interface Face {
  faceId: string;            // Provider's face identifier
  boundingBox: BoundingBox;  // Face location in image
  confidence: number;        // Detection confidence (0-1)
  externalImageId?: string;  // Our photo ID
  attributes?: FaceAttributes; // Optional attributes
  provider: 'aws' | 'sabaiface'; // Which provider indexed this face
}

/**
 * Face that couldn't be indexed (with reasons)
 */
export interface UnindexedFace {
  faceDetail?: {
    boundingBox?: BoundingBox;
    confidence?: number;
  };
  reasons?: string[]; // e.g., ['LOW_QUALITY', 'FACE_TOO_SMALL']
}

/**
 * Similar face from search operation
 */
export interface SimilarFace {
  faceId: string;
  similarity: number;        // Similarity score (0-1, higher = more similar)
  boundingBox?: BoundingBox;
  confidence?: number;       // Detection confidence (0-1)
  externalImageId?: string;  // Our photo ID
  provider: 'aws' | 'sabaiface';
}

/**
 * Result of indexing a photo
 */
export interface PhotoIndexed {
  faces: Face[];               // Successfully indexed faces
  unindexedFaces: UnindexedFace[]; // Faces that couldn't be indexed
  modelVersion?: string;       // Provider's model version
  provider: 'aws' | 'sabaiface';
}

// =============================================================================
// Request/Response Types
// =============================================================================

/**
 * Options for face indexing
 */
export interface SearchOptions {
  maxFaces?: number;         // Max results to return (default: 10)
  minConfidence?: number;    // Min detection confidence (0-1, default: 0.5)
  qualityFilter?: 'auto' | 'none'; // Quality filtering
}

/**
 * Parameters for indexing a photo
 */
export interface IndexPhotoParams {
  eventId: string;           // Event/collection identifier
  photoId: string;           // Photo identifier
  imageData: ArrayBuffer;    // Image bytes
  options?: SearchOptions;
}

/**
 * Parameters for finding similar faces
 */
export interface FindSimilarParams {
  eventId: string;           // Event/collection identifier
  imageData: ArrayBuffer;    // Query image bytes
  maxResults?: number;       // Max results to return (default: 10)
  minSimilarity?: number;    // Min similarity threshold (0-1, default: 0.8)
}

// =============================================================================
// Raw Provider Responses (for model training)
// =============================================================================

/**
 * Raw AWS Rekognition response structure
 * Stored in database for future model training
 */
export interface AWSRawResponse {
  Face?: {
    FaceId?: string;
    BoundingBox?: {
      Width?: number;
      Height?: number;
      Left?: number;
      Top?: number;
    };
    ImageId?: string;
    ExternalImageId?: string;
    Confidence?: number;
    IndexFacesModelVersion?: string;
  };
  FaceDetail?: {
    BoundingBox?: {
      Width?: number;
      Height?: number;
      Left?: number;
      Top?: number;
    };
    AgeRange?: { Low?: number; High?: number };
    Smile?: { Value?: boolean; Confidence?: number };
    Eyeglasses?: { Value?: boolean; Confidence?: number };
    Sunglasses?: { Value?: boolean; Confidence?: number };
    Gender?: { Value?: string; Confidence?: number };
    Beard?: { Value?: boolean; Confidence?: number };
    Mustache?: { Value?: boolean; Confidence?: number };
    EyesOpen?: { Value?: boolean; Confidence?: number };
    MouthOpen?: { Value?: boolean; Confidence?: number };
    Emotions?: Array<{ Type?: string; Confidence?: number }>;
    Landmarks?: Array<{ Type?: string; X?: number; Y?: number }>;
    Pose?: { Roll?: number; Yaw?: number; Pitch?: number };
    Quality?: { Brightness?: number; Sharpness?: number };
    Confidence?: number;
    FaceOccluded?: { Value?: boolean; Confidence?: number };
    EyeDirection?: { Yaw?: number; Pitch?: number; Confidence?: number };
  };
}

/**
 * Raw SabaiFace response structure
 * Stored in database for future model training
 */
export interface SabaiFaceRawResponse {
  faceId: string;
  descriptor: string;        // Base64 encoded 128-D descriptor
  detection: {
    box: { x: number; y: number; width: number; height: number };
    confidence: number;
  };
  landmarks?: Array<{ type: string; x: number; y: number }>;
  age?: number;
  gender?: string;
  genderConfidence?: number;
  expressions?: Record<string, number>; // emotion name -> confidence
}

/**
 * Union type for raw provider responses
 */
export type ProviderRawResponse = AWSRawResponse | SabaiFaceRawResponse;

// =============================================================================
// Face Service Interface
// =============================================================================

import { ResultAsync } from 'neverthrow';
import type { FaceServiceError } from './errors';

/**
 * Provider-agnostic face recognition service.
 *
 * All implementations MUST:
 * - Normalize confidence scores to 0-1 scale
 * - Store raw provider responses for training
 * - Use provider field to track origin
 * - Preserve bounding boxes in 0-1 scale
 * - Return Promise<ResultAsync> for typed error handling
 *
 * NOTE: The return type is Promise<ResultAsync<T, E>> to allow adapters
 * to use async/await internally while maintaining neverthrow compatibility.
 */
export interface FaceService {
  /**
   * Index faces from a photo into an event collection.
   *
   * @param params - Photo indexing parameters
   * @returns Promise resolving to ResultAsync with PhotoIndexed or FaceServiceError
   */
  indexPhoto(params: IndexPhotoParams): Promise<ResultAsync<PhotoIndexed, FaceServiceError>>;

  /**
   * Find similar faces in an event collection.
   *
   * @param params - Search parameters
   * @returns Promise resolving to ResultAsync with array of similar faces (sorted by similarity) or FaceServiceError
   */
  findSimilarFaces(params: FindSimilarParams): Promise<ResultAsync<SimilarFace[], FaceServiceError>>;

  /**
   * Delete faces from a photo.
   *
   * @param eventId - Event/collection identifier
   * @param faceIds - Array of face IDs to delete
   * @returns Promise resolving to ResultAsync with void or FaceServiceError
   */
  deleteFaces(eventId: string, faceIds: string[]): Promise<ResultAsync<void, FaceServiceError>>;

  /**
   * Delete an entire event collection.
   *
   * @param eventId - Event/collection identifier
   * @returns Promise resolving to ResultAsync with void or FaceServiceError
   */
  deleteCollection(eventId: string): Promise<ResultAsync<void, FaceServiceError>>;

  /**
   * Create a new event collection.
   *
   * @param eventId - Event/collection identifier
   * @returns Promise resolving to ResultAsync with collection ARN/identifier or FaceServiceError
   */
  createCollection(eventId: string): Promise<ResultAsync<string, FaceServiceError>>;
}
