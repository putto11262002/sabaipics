/**
 * Rekognition Integration
 *
 * Re-exports for clean imports:
 * import { indexFacesSafe, RekognitionError } from "../lib/rekognition";
 */

// Client and operations
export {
  createRekognitionClient,
  createCollection,
  createCollectionSafe,
  deleteCollection,
  indexFaces,
  indexFacesSafe,
  getCollectionId,
  RekognitionError,
  type RekognitionEnv,
  type IndexFacesResult,
  // SDK types
  type FaceRecord,
  type UnindexedFace,
  type FaceDetail,
  type Face,
  type BoundingBox,
  type AgeRange,
  type Emotion,
  type Landmark,
  type Pose,
  type ImageQuality,
  type Reason,
} from './client';

// Base error types
export { MyError, type MyErrorOptions } from '../error';

// Legacy error helpers (still work with RekognitionError)
export {
  isRetryableError,
  isNonRetryableError,
  isThrottlingError,
  getBackoffDelay,
  getThrottleBackoffDelay,
  formatErrorMessage,
} from './errors';
