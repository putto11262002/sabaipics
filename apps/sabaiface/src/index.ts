/**
 * SabaiFace - Provider-agnostic face recognition service
 *
 * Public API exports for use in other packages.
 */

// =============================================================================
// Domain Types
// =============================================================================

export type {
  // Core interfaces
  FaceService,

  // Domain models
  Face,
  UnindexedFace,
  SimilarFace,
  PhotoIndexed,
  BoundingBox,
  FaceAttributes,
  AgeRange,
  Emotion,
  Gender,

  // Request/Response types
  IndexPhotoParams,
  FindSimilarParams,
  SearchOptions,

  // Raw provider responses (for training)
  ProviderRawResponse,
  AWSRawResponse,
  SabaiFaceRawResponse,
} from './domain/face-service';

// =============================================================================
// Factory Functions
// =============================================================================

export {
  createFaceService,
  createAWSFaceService,
  createSabaiFaceService,
} from './factory/face-service-factory';

export type {
  ProviderConfig,
  AWSProviderConfig,
  SabaiFaceProviderConfig,
} from './factory/face-service-factory';

// =============================================================================
// Core Abstractions (for advanced use cases)
// =============================================================================

export type {
  VectorStore,
  FaceMetadata,
  FaceMatch,
  FaceData,
} from './core/vector-store';

export {
  distanceToSimilarity,
  similarityToDistance,
} from './core/vector-store';

export type {
  FaceDetector,
  DetectedFace,
  FaceDetectorConfig,
} from './core/face-detector';

export {
  pixelBoxToRatio,
  ratioBoxToPixel,
} from './core/face-detector';

// =============================================================================
// Adapters (for direct instantiation if needed)
// =============================================================================

export { AWSFaceAdapter } from './adapters/aws/aws-adapter';
export { SabaiFaceAdapter } from './adapters/sabaiface/sabaiface-adapter';

// =============================================================================
// Version Information
// =============================================================================

export const VERSION = '0.0.1';
export const FACE_MODEL_VERSION = 'face-api.js-v1.7.0';
