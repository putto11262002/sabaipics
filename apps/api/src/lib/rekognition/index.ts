/**
 * Face Recognition Integration
 *
 * Unified interface for face recognition providers (AWS Rekognition, SabaiFace).
 *
 * Usage:
 * ```typescript
 * import { createFaceProvider, getCollectionId } from '../lib/rekognition';
 *
 * const provider = createFaceProvider(env);
 * const result = await provider.indexPhoto({
 *   eventId: 'event-123',
 *   photoId: 'photo-456',
 *   imageData: imageBytes,
 * });
 * ```
 */

// Provider factory and utilities
export { createFaceProvider, getCollectionId, type FaceProviderEnv } from './provider';

// Individual providers (for direct use if needed)
export { createAWSProvider, type AWSProviderConfig } from './aws-provider';
export { createSabaiFaceProvider, type SabaiFaceProviderConfig } from './sabaiface-provider';

// Types
export type {
  // Domain models
  BoundingBox,
  AgeRange,
  Emotion,
  Gender,
  FaceAttributes,
  Face,
  UnindexedFace,
  SimilarFace,
  PhotoIndexed,

  // Raw provider responses (for training data)
  AWSRawFaceRecord,
  SabaiFaceRawRecord,
  ProviderRawResponse,

  // Request types
  IndexPhotoRequest,
  FindSimilarRequest,

  // Error types
  FaceServiceError,

  // Provider interface
  FaceRecognitionProvider,
} from './types';

// Error helpers and backoff
export {
  isRetryableError,
  isNonRetryableError,
  isThrottlingError,
  isResourceAlreadyExistsError,
  isResourceNotFoundError,
  getBackoffDelay,
  getThrottleBackoffDelay,
  formatErrorMessage,
} from './errors';
