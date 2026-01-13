/**
 * Face Recognition SDK Types
 *
 * Shared types for HTTP client SDK.
 * Re-exports domain types from server and defines SDK configuration.
 */

// =============================================================================
// Re-export Domain Types from Server
// =============================================================================

export type {
  // Domain Models
  BoundingBox,
  AgeRange,
  Emotion,
  Gender,
  FaceAttributes,
  Face,
  UnindexedFace,
  SimilarFace,
  PhotoIndexed,

  // Request/Response Types
  IndexPhotoParams,
  FindSimilarParams,
  SearchOptions,

  // Raw Provider Responses (for training data)
  AWSRawResponse,
  SabaiFaceRawResponse,
  ProviderRawResponse,
} from '../../src/domain/face-service';

// Re-export FaceServiceError from server domain
// Note: The SDK uses a slightly different error type for HTTP client scenarios
// where SabaiFace errors CAN be retryable (network failures, etc.)
export type { FaceServiceError as DomainFaceServiceError } from '../../src/domain/errors';

/**
 * SDK Face Service Error
 *
 * Extended error type for SDK use cases.
 * Unlike the domain error type, SDK SabaiFace errors CAN be retryable
 * (e.g., network failures, 5xx server errors, 429 rate limits).
 *
 * This allows the SDK consumer to make informed retry decisions.
 */
export type FaceServiceError =
  // Domain errors (not retryable)
  | { type: 'not_found'; resource: 'collection' | 'face'; id: string; retryable: false; throttle: false }
  | { type: 'invalid_input'; field: string; reason: string; retryable: false; throttle: false }

  // AWS provider failures - bubbles retryable/throttle from AWS
  | { type: 'provider_failed'; provider: 'aws'; retryable: boolean; throttle: boolean; cause: unknown }

  // SabaiFace provider failures - CAN be retryable (network/server errors)
  | { type: 'provider_failed'; provider: 'sabaiface'; retryable: boolean; throttle: boolean; cause: unknown }

  // Database errors - retryable
  | { type: 'database'; operation: string; retryable: true; throttle: false; cause: unknown };

// =============================================================================
// SDK Configuration
// =============================================================================

/**
 * Face Recognition Client Configuration
 *
 * Configures which provider to use (AWS or SabaiFace) and provider-specific settings.
 */
export interface FaceClientConfig {
  /** Which face recognition provider to use */
  provider: 'aws' | 'sabaiface';

  /** SabaiFace configuration (required when provider='sabaiface') */
  endpoint?: string; // e.g., 'https://sabaiface.example.com'

  /** AWS configuration (required when provider='aws') */
  aws?: {
    region: string;
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  };
}

// =============================================================================
// Request Types (matching domain params but for SDK)
// =============================================================================

/**
 * Index Photo Request
 *
 * Same as IndexPhotoParams from domain, re-exported for SDK consumers.
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
 *
 * Same as FindSimilarParams from domain, re-exported for SDK consumers.
 */
export interface FindSimilarRequest {
  eventId: string;
  imageData: ArrayBuffer;
  maxResults?: number;
  minSimilarity?: number;
}

// =============================================================================
// HTTP Error Types
// =============================================================================

/**
 * HTTP Error Response
 *
 * Error returned from SabaiFace HTTP endpoint.
 */
export interface HTTPErrorResponse {
  message: string;
  type?: string;
  retryable?: boolean;
  throttle?: boolean;
}
