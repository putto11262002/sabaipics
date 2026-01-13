/**
 * Face Recognition HTTP Client SDK
 *
 * Used by Cloudflare Workers photo queue to call:
 * - AWS Rekognition (via AWS SDK)
 * - SabaiFace service (via HTTP)
 *
 * All methods return ResultAsync for typed error handling.
 * Errors include retryable and throttle flags for consumer retry logic.
 *
 * @example
 * ```typescript
 * import { FaceRecognitionClient } from '@sabaipics/face-recognition';
 *
 * const client = new FaceRecognitionClient({
 *   provider: 'sabaiface',
 *   endpoint: 'https://sabaiface.example.com',
 * });
 *
 * const result = await client.indexPhoto({
 *   eventId: 'event-123',
 *   photoId: 'photo-456',
 *   imageData: ArrayBuffer,
 * });
 *
 * if (result.isErr()) {
 *   const error = result.error;
 *   if (error.retryable) {
 *     // Retry with backoff
 *   }
 *   if (error.throttle) {
 *     // Rate limit hit - use longer backoff
 *   }
 * }
 *
 * const indexed = result.value;
 * console.log(`Found ${indexed.faces.length} faces`);
 * ```
 */

// Main exports
export { FaceRecognitionClient } from './client';
export { AWSRekognitionClient } from './aws';
export { SabaiFaceHTTPClient } from './sabaiface';

// Type exports
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

  // Raw Provider Responses
  AWSRawResponse,
  SabaiFaceRawResponse,
  ProviderRawResponse,

  // SDK Configuration
  FaceClientConfig,
  IndexPhotoRequest,
  FindSimilarRequest,
  HTTPErrorResponse,

  // Error Types
  FaceServiceError,
} from './types';
