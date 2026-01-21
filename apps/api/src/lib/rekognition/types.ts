/**
 * Face Recognition Types
 *
 * Provider-agnostic types for face recognition operations.
 * All confidence scores normalized to 0-1 scale (not 0-100).
 *
 * Includes raw response types for model training data.
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
 * Face attributes (age, gender, emotions, etc.)
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

// =============================================================================
// Raw Provider Responses (for model training)
// =============================================================================

/**
 * Raw AWS Rekognition FaceRecord structure.
 * Stored in database for future model training.
 */
export interface AWSRawFaceRecord {
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
 * Raw SabaiFace response structure.
 * Stored in database for future model training.
 */
export interface SabaiFaceRawRecord {
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
export type ProviderRawResponse = AWSRawFaceRecord | SabaiFaceRawRecord;

// =============================================================================
// Face Types
// =============================================================================

/**
 * Detected and indexed face.
 * Includes both normalized data and raw response for training.
 */
export interface Face {
  faceId: string;            // Provider's face identifier
  boundingBox: BoundingBox;  // Face location in image (normalized 0-1)
  confidence: number;        // Detection confidence (0-1)
  externalImageId?: string;  // Our photo ID
  attributes?: FaceAttributes; // Optional face attributes
  provider: 'aws' | 'sabaiface'; // Which provider indexed this face
  rawResponse?: ProviderRawResponse; // Raw provider response for training
}

/**
 * Face that couldn't be indexed (with reasons)
 */
export interface UnindexedFace {
  faceDetail?: {
    boundingBox?: BoundingBox;
    confidence?: number;
  };
  reasons: string[]; // e.g., ['LOW_QUALITY', 'FACE_TOO_SMALL']
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

/**
 * Photo match from findImagesByFace operation
 */
export interface PhotoMatch {
  photoId: string;
  similarity: number;
  faceCount?: number;
}

/**
 * Result of findImagesByFace operation
 */
export interface FindImagesByFaceResponse {
  photos: PhotoMatch[];
  totalMatchedFaces: number;
  provider: 'aws' | 'sabaiface';
}

// =============================================================================
// Request Types
// =============================================================================

/**
 * Index Photo Request
 */
export interface IndexPhotoRequest {
  eventId: string;
  photoId: string;
  imageData: ArrayBuffer;
  options?: {
    maxFaces?: number;
    qualityFilter?: 'auto' | 'none';
  };
}

/**
 * Find Similar Faces Request
 */
export interface FindSimilarRequest {
  eventId: string;
  imageData: ArrayBuffer;
  maxResults?: number;
  minSimilarity?: number;
}

/**
 * Find Images by Face Request
 */
export interface FindImagesByFaceRequest {
  eventId: string;
  imageData: ArrayBuffer;
  maxResults?: number;
  minSimilarity?: number;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Face Service Error - discriminated union for typed error handling.
 *
 * All errors include retryable and throttle flags for consumer retry logic.
 */
export type FaceServiceError =
  // Domain errors (not retryable)
  | { type: 'not_found'; resource: 'collection' | 'face'; id: string; retryable: false; throttle: false }
  | { type: 'invalid_input'; field: string; reason: string; retryable: false; throttle: false }

  // AWS provider failures - bubbles retryable/throttle from AWS
  | { type: 'provider_failed'; provider: 'aws'; retryable: boolean; throttle: boolean; cause: unknown; errorName?: string }

  // SabaiFace provider failures - CAN be retryable (network/server errors)
  | { type: 'provider_failed'; provider: 'sabaiface'; retryable: boolean; throttle: boolean; cause: unknown }

  // Database errors - retryable
  | { type: 'database'; operation: string; retryable: true; throttle: false; cause: unknown };

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Face Recognition Provider Interface
 *
 * Implemented by AWS and SabaiFace providers.
 * All methods return ResultAsync for typed error handling.
 */
export interface FaceRecognitionProvider {
  indexPhoto(request: IndexPhotoRequest): ResultAsync<PhotoIndexed, FaceServiceError>;
  findSimilarFaces(request: FindSimilarRequest): ResultAsync<SimilarFace[], FaceServiceError>;
  findImagesByFace(request: FindImagesByFaceRequest): ResultAsync<FindImagesByFaceResponse, FaceServiceError>;
  deleteFaces(eventId: string, faceIds: string[]): ResultAsync<void, FaceServiceError>;
  deleteCollection(eventId: string): ResultAsync<void, FaceServiceError>;
  createCollection(eventId: string): ResultAsync<string, FaceServiceError>;
}

// =============================================================================
// Legacy Type Aliases (for backwards compatibility during migration)
// =============================================================================

/**
 * @deprecated Use FaceServiceError instead
 */
export type AWSRekognitionError = Extract<FaceServiceError, { provider: 'aws' }>;
